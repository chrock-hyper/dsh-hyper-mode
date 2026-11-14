import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { serializePage } from '../lib/page.js'
import { createWikiTool, runWikiAction, WIKI_ACTIONS } from '../lib/tools.js'
import { makeEnv, write } from './helpers.js'

/** A page document used across the tool tests. */
const PAGE = serializePage({ title: '安装', tags: ['guide'], status: 'stable', updated: '2026-11-01', body: 'old body' })

/**
 * Build the tool against one environment.
 * @param env - fixture.
 * @param options - `caller` and `cwd` overrides.
 * @returns the definition the fake `defineTool` produced.
 */
function tool(env, options = {}) {
  return createWikiTool(options => options, {
    core: env.core,
    scopes: env.scopes,
    cwdOf: () => (options.cwd === null ? undefined : options.cwd === undefined ? env.workspace : options.cwd),
    callerOf: () => options.caller ?? 'lead',
  })
}

/**
 * Call one action on the built tool.
 * @param env - fixture.
 * @param args - tool arguments.
 * @param options - caller and cwd overrides.
 * @returns the canonical tool value.
 */
async function run(env, args, options = {}) {
  return tool(env, options).execute(args, {})
}

describe('tool definition', () => {
  test('exposes exactly six actions and none of them is an approval', () => {
    expect(WIKI_ACTIONS).toEqual(['list', 'search', 'read', 'draft', 'status', 'backlinks'])
    expect(WIKI_ACTIONS).not.toContain('approve')
    expect(WIKI_ACTIONS).not.toContain('reject')
    expect(WIKI_ACTIONS).not.toContain('delete')
    expect(WIKI_ACTIONS).not.toContain('rename')
  })

  test('declares the design parameters and nothing that could approve', () => {
    const definition = tool(makeEnv())
    expect(definition.name).toBe('wiki')
    expect(definition.description.length).toBeGreaterThan(40)
    // The real shipped `defineTool` compiles this author-facing spec; the fake
    // one keeps it, so the assertions read the design directly.
    const parameters = definition.parameters
    expect(Object.keys(parameters).sort()).toEqual(
      ['action', 'content', 'path', 'query', 'scope', 'status', 'tags', 'title'].sort(),
    )
    expect(parameters.action.required).toBe(true)
    expect(parameters.action.enum).toEqual(WIKI_ACTIONS)
    expect(parameters.scope.enum).toEqual(['global', 'project'])
    expect(parameters.status.enum).toEqual(['stable', 'wip', 'deprecated'])
    expect(parameters.path.required).toBeUndefined()
    for (const forbidden of ['approve', 'reject', 'force', 'reason', 'actor']) {
      expect(parameters[forbidden]).toBeUndefined()
    }
  })

  test('declares an output schema and a text renderer', () => {
    const definition = tool(makeEnv())
    expect(definition.output.schema.type).toBe('object')
    expect(definition.output.schema.properties.summary.type).toBe('string')
    const blocks = definition.output.render({ action: 'list' }, { ok: true, summary: 'three pages' })
    expect(blocks).toEqual([{ type: 'text', text: 'three pages' }])
  })
})

describe('draft action', () => {
  test('writes the mirrored draft path and reports created or replaced', async () => {
    const env = makeEnv()
    const first = await run(env, { action: 'draft', path: 'guide/setup', content: '# 新页面\n' }, { cwd: null })
    expect(first.ok).toBe(true)
    expect(first.data.draftPath).toBe('drafts/guide/setup.md')
    expect(first.data.base).toBe('new')
    expect(first.data.created).toBe(true)
    expect(first.data.replaced).toBe(false)
    expect(existsSync(join(env.home, 'wiki', 'drafts', 'guide', 'setup.md'))).toBe(true)

    const second = await run(env, { action: 'draft', path: 'guide/setup', content: '# 再改\n' }, { cwd: null })
    expect(second.data.created).toBe(false)
    expect(second.data.replaced).toBe(true)
    expect(second.data.base).toBe('new')
  })

  test('records the base of an existing page and applies explicit fields', async () => {
    const env = makeEnv()
    write(join(env.home, 'wiki', 'guide', 'setup.md'), PAGE)
    const result = await run(env, {
      action: 'draft',
      path: 'guide/setup.md',
      content: '新正文',
      title: '安装指南',
      tags: 'guide, 中文',
      status: 'wip',
    })
    expect(result.ok).toBe(true)
    expect(result.data.base).not.toBe('new')
    const draft = readFileSync(join(env.home, 'wiki', 'drafts', 'guide', 'setup.md'), 'utf8')
    expect(draft).toContain('title: 安装指南')
    expect(draft).toContain('tags: guide, 中文')
    expect(draft).toContain('status: wip')
  })

  test('refuses a reserved path and a missing content', async () => {
    const env = makeEnv()
    const reserved = await run(env, { action: 'draft', path: 'drafts/x.md', content: 'x' })
    expect(reserved.ok).toBe(false)
    expect(reserved.data.code).toBe('invalid_path')
    const empty = await run(env, { action: 'draft', path: 'x.md', content: '' })
    expect(empty.ok).toBe(false)
  })

  test('prefers the project store for a new page when the caller has a project', async () => {
    const env = makeEnv()
    const result = await run(env, { action: 'draft', path: 'note.md', content: 'body' }, { cwd: env.workspace })
    expect(result.ok).toBe(true)
    expect(result.data.scope).toBe('project')
    expect(existsSync(join(env.project, '.dsh', 'wiki', 'drafts', 'note.md'))).toBe(true)
    expect(existsSync(join(env.home, 'wiki', 'drafts', 'note.md'))).toBe(false)
  })

  test('honours an explicit scope', async () => {
    const env = makeEnv()
    const result = await run(env, { action: 'draft', path: 'note.md', content: 'body', scope: 'global' })
    expect(result.data.scope).toBe('global')
    expect(existsSync(join(env.home, 'wiki', 'drafts', 'note.md'))).toBe(true)
  })
})

describe('read actions', () => {
  test('list tags rows with their scope and skips stores without a wiki', async () => {
    const env = makeEnv()
    write(join(env.home, 'wiki', 'a.md'), PAGE)
    const result = await run(env, { action: 'list' }, { cwd: env.workspace })
    expect(result.ok).toBe(true)
    expect(result.data.pages.map(row => row.scope)).toEqual(['global'])
    expect(result.data.pages[0].path).toBe('a.md')
  })

  test('search ranks title matches and caps results', async () => {
    const env = makeEnv()
    for (let index = 0; index < 25; index += 1) {
      write(join(env.home, 'wiki', `p${String(index).padStart(2, '0')}.md`), serializePage({ title: 'deploy guide', body: 'x' }))
    }
    write(join(env.home, 'wiki', 'zz-tag.md'), serializePage({ title: 'other', tags: 'deploy', body: 'x' }))
    const result = await run(env, { action: 'search', query: 'deploy' })
    expect(result.ok).toBe(true)
    // Every title hit (weight 3) ranks above the tag-only hit (weight 2)…
    expect(result.data.results[0].path).toBe('p00.md')
    // …and the ceiling is 20, so 25 title hits fill the page and the
    // tag-only match is cut off entirely.
    expect(result.data.results.length).toBe(20)
    expect(result.data.results.some(row => row.path === 'zz-tag.md')).toBe(false)
  })

  test('read returns the body and reports drafts and backlinks', async () => {
    const env = makeEnv()
    write(join(env.home, 'wiki', 'index.md'), serializePage({ title: '首页', body: '[a](./a.md)' }))
    write(join(env.home, 'wiki', 'a.md'), PAGE)
    env.core.writeDraft(env.scopes.global(), { path: 'a.md', content: 'x', author: 'lead' })
    const result = await run(env, { action: 'read', path: 'a.md' })
    expect(result.ok).toBe(true)
    expect(result.data.body).toBe('old body')
    expect(result.data.draft.status).toBe('pending')
    expect(result.data.backlinks.map(row => row.path)).toEqual(['index.md'])
    expect(result.summary).toContain('a.md')
  })

  test('read reports a failure value instead of throwing', async () => {
    const env = makeEnv()
    const result = await run(env, { action: 'read', path: 'nope.md' })
    expect(result.ok).toBe(false)
    expect(result.data.code).toBe('not_found')
  })

  test('backlinks lists inbound pages', async () => {
    const env = makeEnv()
    write(join(env.home, 'wiki', 'index.md'), serializePage({ title: '首页', body: '[a](./a.md)' }))
    write(join(env.home, 'wiki', 'a.md'), PAGE)
    const result = await run(env, { action: 'backlinks', path: 'a.md' })
    expect(result.ok).toBe(true)
    expect(result.data.backlinks).toEqual([{ path: 'index.md', title: '首页' }])
  })
})

describe('status action', () => {
  test('lists only the caller’s drafts, with rejection reasons', async () => {
    const env = makeEnv()
    const scope = env.scopes.global()
    write(join(env.home, 'wiki', 'a.md'), PAGE)
    env.core.writeDraft(scope, { path: 'a.md', content: 'x', author: 'lead' })
    env.core.writeDraft(scope, { path: 'b.md', content: 'y', author: 'someone-else' })
    env.core.reject(scope, { path: 'a.md', reason: '定义不准确' })

    const mine = await run(env, { action: 'status' }, { caller: 'lead' })
    expect(mine.ok).toBe(true)
    expect(mine.data.drafts.map(row => row.path)).toEqual(['a.md'])
    expect(mine.data.drafts[0].status).toBe('rejected')
    expect(mine.data.drafts[0].reason).toBe('定义不准确')
    expect(mine.data.drafts[0].text).toBeUndefined()

    const other = await run(env, { action: 'status' }, { caller: 'nobody' })
    expect(other.data.drafts).toEqual([])
  })

  test('marks a draft stale when the page moved on', async () => {
    const env = makeEnv()
    const scope = env.scopes.global()
    write(join(env.home, 'wiki', 'a.md'), PAGE)
    env.core.writeDraft(scope, { path: 'a.md', content: 'x', author: 'lead' })
    write(join(env.home, 'wiki', 'a.md'), serializePage({ title: '安装', body: 'changed' }))
    const result = await run(env, { action: 'status' }, { caller: 'lead' })
    expect(result.data.drafts[0].stale).toBe(true)
  })
})

describe('action dispatch', () => {
  test('an unknown action is a failure value', () => {
    const env = makeEnv()
    const result = runWikiAction({ action: 'approve', core: env.core, scopes: env.scopes, cwd: env.workspace })
    expect(result.ok).toBe(false)
    expect(result.summary).toContain('unknown action')
  })

  test('search requires a query', () => {
    const env = makeEnv()
    const result = runWikiAction({ action: 'search', query: '  ', core: env.core, scopes: env.scopes, cwd: env.workspace })
    expect(result.ok).toBe(false)
  })
})
