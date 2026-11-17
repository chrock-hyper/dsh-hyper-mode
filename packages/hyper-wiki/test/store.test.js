import { describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parsePage, serializePage } from '../src/page.js'
import { createScopes } from '../src/scopes.js'
import { makeEnv, write } from './helpers.js'

/** A simple page document. */
const PAGE = serializePage({
  title: '安装',
  tags: ['guide'],
  status: 'wip',
  updated: '2026-11-01',
  body: '# 安装\n\n步骤。\n',
})

/**
 * Run git in a directory.
 * @param cwd - repository directory.
 * @param args - git arguments.
 * @returns the process result.
 */
function git(cwd, args) {
  return spawnSync('git', args, { cwd, encoding: 'utf8' })
}

describe('scope resolution', () => {
  test('global and project stores are separate paths', () => {
    const env = makeEnv()
    const globalScope = env.scopes.global()
    const projectScope = env.scopes.project(env.workspace)
    expect(globalScope.wikiDir).toBe(join(env.home, 'wiki'))
    expect(projectScope.wikiDir).toBe(join(env.project, '.dsh', 'wiki'))
    expect(globalScope.git).toBe(true)
    expect(projectScope.git).toBe(false)
    expect(env.scopes.listScopes(env.workspace).map(row => row.scope)).toEqual(['global', 'project'])
    expect(env.scopes.project(undefined)).toBeUndefined()
  })

  test('the same page id resolves to two independent files', () => {
    const env = makeEnv()
    write(join(env.home, 'wiki', 'term.md'), serializePage({ title: '全局术语', body: 'G' }))
    write(join(env.project, '.dsh', 'wiki', 'term.md'), serializePage({ title: '项目术语', body: 'P' }))
    const globalScope = env.scopes.global()
    const projectScope = env.scopes.project(env.workspace)
    expect(env.core.read(globalScope, 'term.md').title).toBe('全局术语')
    expect(env.core.read(projectScope, 'term.md').title).toBe('项目术语')
  })

  test('presence means the contract file or at least one page, not a bare directory', () => {
    const env = makeEnv()
    const scope = env.scopes.global()
    expect(env.scopes.hasWiki(scope)).toBe(false)
    // The panel's own state file can create the directory; that is not a wiki.
    write(join(env.home, 'wiki', 'state.json'), '{"version":1,"recentProjects":[]}')
    expect(env.scopes.hasWiki(scope)).toBe(false)
    write(join(env.home, 'wiki', 'guide', 'deep', 'page.md'), PAGE)
    expect(env.scopes.hasWiki(scope)).toBe(true)

    const second = createScopes({ home: join(env.home, 'contract-only') })
    write(join(env.home, 'contract-only', 'wiki.md'), '# 契约')
    expect(second.hasWiki(second.global())).toBe(true)
  })

  test('a drafts-only store still reports a pending draft', () => {
    const env = makeEnv()
    const scope = env.scopes.global()
    env.core.writeDraft(scope, { path: 'new/page.md', content: 'x', author: 'lead' })
    expect(env.scopes.hasWiki(scope)).toBe(false)
    expect(env.core.pending(scope)).toBe(1)
  })

  test('records a project for the panel and dedupes repeated calls', () => {
    const env = makeEnv()
    expect(env.scopes.readRecent()).toEqual([])
    expect(env.scopes.noteRecent(env.project)).toBe(true)
    expect(env.scopes.noteRecent(env.project)).toBe(false)
    expect(env.scopes.readRecent()).toEqual([env.project])
    const state = JSON.parse(readFileSync(join(env.home, 'wiki', 'state.json'), 'utf8'))
    expect(state.recentProjects).toEqual([env.project])
  })
})

describe('page listing and reading', () => {
  test('walks nested pages and ignores drafts, trash, and non-markdown files', () => {
    const env = makeEnv()
    write(join(env.home, 'wiki', 'index.md'), PAGE)
    write(join(env.home, 'wiki', 'guide', 'setup.md'), serializePage({ title: 'Setup', body: 's' }))
    write(join(env.home, 'wiki', 'drafts', 'index.md'), 'draft body')
    write(join(env.home, 'wiki', '.trash', 'index.20260101T000000000Z.md'), 'trashed')
    write(join(env.home, 'wiki', 'state.json'), '{}')
    write(join(env.home, 'wiki', '.hidden', 'secret.md'), 'hidden')

    const rows = env.core.list(env.scopes.global())
    expect(rows.map(row => row.path)).toEqual(['guide/setup.md', 'index.md'])
    expect(rows[0].title).toBe('Setup')
  })

  test('read returns the body, backlinks, and the matching draft', () => {
    const env = makeEnv()
    write(join(env.home, 'wiki', 'index.md'), serializePage({ title: '首页', body: 'See [setup](./guide/setup.md).\n' }))
    write(join(env.home, 'wiki', 'guide', 'setup.md'), PAGE)
    env.core.writeDraft(env.scopes.global(), { path: 'guide/setup', content: '新正文', author: 'lead' })

    const view = env.core.read(env.scopes.global(), 'guide/setup.md')
    expect(view.ok).toBe(true)
    expect(view.title).toBe('安装')
    expect(view.draft.status).toBe('pending')
    expect(view.draft.author).toBe('lead')
    // The panel builds its diff from the draft body, so the view carries it.
    expect(view.draft.body).toBe('新正文')
    expect(view.draft.stale).toBe(false)
    expect(view.backlinks).toEqual([{ path: 'index.md', title: '首页' }])
  })

  test('read reports a missing page', () => {
    const env = makeEnv()
    const view = env.core.read(env.scopes.global(), 'nope.md')
    expect(view.ok).toBe(false)
    expect(view.code).toBe('not_found')
  })
})

describe('delete', () => {
  test('moves the page into .trash and reports inbound links', () => {
    const env = makeEnv({ now: () => new Date('2026-11-15T05:06:07.890Z') })
    write(join(env.home, 'wiki', 'index.md'), serializePage({ title: '首页', body: '[setup](./guide/setup.md)' }))
    write(join(env.home, 'wiki', 'guide', 'setup.md'), PAGE)

    const removed = env.core.remove(env.scopes.global(), 'guide/setup.md')
    expect(removed.ok).toBe(true)
    expect(removed.trashPath).toBe('.trash/guide/setup.md.20261115T050607890Z.md')
    expect(existsSync(join(env.home, 'wiki', 'guide', 'setup.md'))).toBe(false)
    expect(existsSync(join(env.home, 'wiki', '.trash', 'guide', 'setup.md.20261115T050607890Z.md'))).toBe(true)
    expect(removed.backlinks).toEqual([{ path: 'index.md', title: '首页' }])
    expect(env.core.list(env.scopes.global()).map(row => row.path)).toEqual(['index.md'])
  })

  test('reports not_found for an absent page', () => {
    const env = makeEnv()
    const removed = env.core.remove(env.scopes.global(), 'nope.md')
    expect(removed.ok).toBe(false)
    expect(removed.code).toBe('not_found')
  })
})

describe('rename', () => {
  test('moves the file, lists affected backlinks, and leaves other pages untouched', () => {
    const env = makeEnv()
    const indexBody = '[setup](./setup.md) and [term](./term.md)'
    write(join(env.home, 'wiki', 'index.md'), serializePage({ title: '首页', body: indexBody }))
    write(join(env.home, 'wiki', 'setup.md'), PAGE)

    const renamed = env.core.rename(env.scopes.global(), { from: 'setup.md', to: 'guide/setup.md' })
    expect(renamed.ok).toBe(true)
    expect(renamed.from).toBe('setup.md')
    expect(renamed.to).toBe('guide/setup.md')
    expect(renamed.backlinks).toEqual([{ path: 'index.md', title: '首页' }])
    expect(existsSync(join(env.home, 'wiki', 'guide', 'setup.md'))).toBe(true)
    expect(existsSync(join(env.home, 'wiki', 'setup.md'))).toBe(false)
    // The plugin never rewrites another page's links.
    expect(readFileSync(join(env.home, 'wiki', 'index.md'), 'utf8')).toContain('[setup](./setup.md)')
  })

  test('refuses an existing target and reports an absent source', () => {
    const env = makeEnv()
    write(join(env.home, 'wiki', 'a.md'), PAGE)
    write(join(env.home, 'wiki', 'b.md'), PAGE)
    expect(env.core.rename(env.scopes.global(), { from: 'a.md', to: 'b.md' }).code).toBe('conflict')
    expect(env.core.rename(env.scopes.global(), { from: 'missing.md', to: 'c.md' }).code).toBe('not_found')
    expect(env.core.rename(env.scopes.global(), { from: 'a.md', to: 'a.md' }).code).toBe('invalid_path')
  })

  test('reports a draft left behind at the old path', () => {
    const env = makeEnv()
    write(join(env.home, 'wiki', 'a.md'), PAGE)
    env.core.writeDraft(env.scopes.global(), { path: 'a.md', content: 'x', author: 'lead' })
    const renamed = env.core.rename(env.scopes.global(), { from: 'a.md', to: 'b.md' })
    expect(renamed.ok).toBe(true)
    expect(renamed.draftLeftBehind).toBe(true)
  })
})

describe('git history', () => {
  test('initializes the global store and commits an approval', () => {
    const env = makeEnv()
    const scope = env.scopes.global()
    write(join(env.home, 'wiki', 'terms.md'), PAGE)
    env.core.writeDraft(scope, { path: 'terms.md', content: '新定义', author: 'lead' })

    const approved = env.core.approve(scope, { path: 'terms.md', actor: 'lead' })
    expect(approved.ok).toBe(true)
    expect(approved.commit.committed).toBe(true)
    expect(existsSync(join(env.home, 'wiki', '.git'))).toBe(true)
    const log = git(join(env.home, 'wiki'), ['log', '--oneline'])
    expect(log.status).toBe(0)
    expect(log.stdout).toContain('wiki: approve terms.md by lead')
    // Panel navigation state never reaches the history.
    const tracked = git(join(env.home, 'wiki'), ['ls-files'])
    expect(tracked.stdout).not.toContain('state.json')
  })

  test('commits a delete and a rename too', () => {
    const env = makeEnv()
    const scope = env.scopes.global()
    write(join(env.home, 'wiki', 'a.md'), PAGE)
    env.core.rename(scope, { from: 'a.md', to: 'b.md' })
    env.core.remove(scope, 'b.md')
    const log = git(join(env.home, 'wiki'), ['log', '--pretty=%s'])
    expect(log.stdout).toContain('wiki: rename a.md -> b.md')
    expect(log.stdout).toContain('wiki: delete b.md')
  })

  test('degrades without a git executable instead of failing the mutation', () => {
    const env = makeEnv({ gitBin: 'dsh-wiki-definitely-missing-git' })
    const scope = env.scopes.global()
    write(join(env.home, 'wiki', 'terms.md'), PAGE)
    env.core.writeDraft(scope, { path: 'terms.md', content: '新定义', author: 'lead' })

    const approved = env.core.approve(scope, { path: 'terms.md', actor: 'lead' })
    expect(approved.ok).toBe(true)
    expect(approved.commit.committed).toBe(false)
    expect(parsePage(readFileSync(join(env.home, 'wiki', 'terms.md'), 'utf8')).body).toBe('新定义')
    expect(existsSync(join(env.home, 'wiki', '.git'))).toBe(false)
    expect(env.logger.rows.some(row => row[0] === 'debug' && String(row[1]).includes('git unavailable'))).toBe(true)
  })

  test('never runs git for the project store', () => {
    const env = makeEnv()
    const scope = env.scopes.project(env.workspace)
    write(join(env.project, '.dsh', 'wiki', 'terms.md'), PAGE)
    env.core.writeDraft(scope, { path: 'terms.md', content: '新定义', author: 'lead' })

    const approved = env.core.approve(scope, { path: 'terms.md', actor: 'lead' })
    expect(approved.ok).toBe(true)
    expect(approved.commit).toBeUndefined()
    expect(existsSync(join(env.project, '.dsh', 'wiki', '.git'))).toBe(false)
    expect(existsSync(join(env.project, '.dsh', 'wiki', 'drafts', 'terms.md'))).toBe(false)
    expect(readdirSync(join(env.project, '.dsh', 'wiki')).sort()).toEqual(['drafts', 'terms.md'])
  })
})
