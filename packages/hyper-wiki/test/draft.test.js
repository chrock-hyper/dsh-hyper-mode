import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  baseMatches,
  decideApprove,
  decideReject,
  draftPathOf,
  pagePathOfDraft,
  parseDraft,
  serializeDraft,
} from '../src/draft.js'
import { parsePage, serializePage, sha1Hex } from '../src/page.js'
import { makeEnv, write } from './helpers.js'

/** A page as a human would have written it. */
const PAGE = serializePage({
  title: '术语表',
  tags: ['术语'],
  status: 'stable',
  updated: '2026-11-01',
  body: '# 术语\n\n旧定义。\n',
})

/**
 * Build one draft document over a body.
 * @param base - recorded base.
 * @param body - proposed body.
 * @param extra - overrides for the page fields and the draft block.
 * @returns the draft text.
 */
function draftFor(base, body, extra = {}) {
  return serializeDraft({
    title: extra.title ?? '术语表',
    tags: extra.tags ?? ['术语'],
    status: extra.status ?? 'stable',
    updated: extra.updated ?? '2026-11-01',
    draft: {
      status: extra.draftStatus ?? 'pending',
      author: extra.author ?? 'wiki-builder',
      base,
      updated: extra.draftUpdated ?? '2026-11-15T01:02:03.000Z',
      reason: extra.reason,
    },
    body,
  })
}

describe('draft paths', () => {
  test('mirrors the page path under drafts/', () => {
    expect(draftPathOf('guide/setup.md')).toBe('drafts/guide/setup.md')
    expect(pagePathOfDraft('drafts/guide/setup.md')).toBe('guide/setup.md')
    expect(pagePathOfDraft('guide/setup.md')).toBeUndefined()
  })

  test('rejects reserved prefixes and traversal at the store boundary', () => {
    const env = makeEnv()
    const scope = env.scopes.global()
    for (const path of ['drafts/x.md', '.trash/x.md', '../escape.md']) {
      const result = env.core.writeDraft(scope, { path, content: 'body', author: 'tester' })
      expect(result.ok).toBe(false)
      expect(result.code).toBe('invalid_path')
      expect(existsSync(join(env.home, 'wiki', 'escape.md'))).toBe(false)
    }
  })
})

describe('draft documents', () => {
  test('serialize and parse keep the page fields, the block, and the body', () => {
    const text = draftFor('abc', 'new body\n')
    const parsed = parseDraft(text)
    expect(parsed.page.title).toBe('术语表')
    expect(parsed.page.tags).toEqual(['术语'])
    expect(parsed.page.status).toBe('stable')
    expect(parsed.draft).toEqual({
      status: 'pending',
      author: 'wiki-builder',
      base: 'abc',
      updated: '2026-11-15T01:02:03.000Z',
      reason: '',
    })
    expect(parsed.body).toBe('new body\n')
    expect(parsed.errors).toEqual([])
  })

  test('keeps a quoted rejection reason through a round trip', () => {
    const text = draftFor('abc', 'body', {
      draftStatus: 'rejected',
      reason: '术语与 wiki.md 不一致: 需要统一',
    })
    const parsed = parseDraft(text)
    expect(parsed.draft.status).toBe('rejected')
    expect(parsed.draft.reason).toBe('术语与 wiki.md 不一致: 需要统一')
  })

  test('reports a missing or illegal draft status', () => {
    const missing = parseDraft('---\ntitle: x\n---\n\nbody')
    expect(missing.errors.some(line => line.includes('missing draft block'))).toBe(true)
    const illegal = parseDraft('---\ntitle: x\ndraft:\n  status: maybe\n  base: new\n---\n\nbody')
    expect(illegal.errors.some(line => line.includes('invalid draft.status'))).toBe(true)
  })
})

describe('approval state machine', () => {
  test('creates a page from a new-page draft and maintains updated', () => {
    const decision = decideApprove({
      pageText: null,
      draftText: draftFor('new', '# 术语\n\n新定义。\n'),
      path: 'terms.md',
      now: new Date(2026, 10, 15, 3, 0, 0),
    })
    expect(decision.ok).toBe(true)
    expect(decision.created).toBe(true)
    const page = parsePage(decision.pageText)
    expect(page.body).toBe('# 术语\n\n新定义。\n')
    expect(page.updated).toBe('2026-11-15')
    expect(page.fields.draft).toBeUndefined()
  })

  test('replaces a page whose body still matches the recorded base', () => {
    const base = sha1Hex(parsePage(PAGE).body)
    const pageText = serializePage({ ...parsePage(PAGE), updated: '2026-11-01', body: parsePage(PAGE).body })
    const decision = decideApprove({
      pageText,
      draftText: draftFor(base, 'new body\n'),
      path: 'terms.md',
      now: new Date(2026, 10, 15, 3, 0, 0),
    })
    expect(decision.ok).toBe(true)
    expect(decision.created).toBe(false)
    expect(parsePage(decision.pageText).body).toBe('new body\n')
  })

  test('refuses a stale base, and force overrides it', () => {
    const staleBase = sha1Hex('a body that is gone')
    const conflict = decideApprove({ pageText: PAGE, draftText: draftFor(staleBase, 'x\n'), path: 'terms.md' })
    expect(conflict.ok).toBe(false)
    expect(conflict.code).toBe('conflict')

    const forced = decideApprove({
      pageText: PAGE,
      draftText: draftFor(staleBase, 'x\n'),
      path: 'terms.md',
      force: true,
      now: new Date(2026, 10, 15, 3, 0, 0),
    })
    expect(forced.ok).toBe(true)
    expect(parsePage(forced.pageText).body).toBe('x\n')
  })

  test('treats an existing page as a conflict for a new-page draft', () => {
    const conflict = decideApprove({ pageText: PAGE, draftText: draftFor('new', 'x\n'), path: 'terms.md' })
    expect(conflict.ok).toBe(false)
    expect(conflict.code).toBe('conflict')
  })

  test('treats a missing page as a conflict for a base-hash draft', () => {
    const conflict = decideApprove({ pageText: null, draftText: draftFor('abc', 'x\n'), path: 'terms.md' })
    expect(conflict.ok).toBe(false)
    expect(conflict.code).toBe('conflict')
  })

  test('reports baseMatches for present and absent pages', () => {
    const base = sha1Hex(parsePage(PAGE).body)
    expect(baseMatches({ pageText: PAGE, base })).toBe(true)
    expect(baseMatches({ pageText: PAGE, base: 'nope' })).toBe(false)
    expect(baseMatches({ pageText: null, base: 'new' })).toBe(true)
    expect(baseMatches({ pageText: null, base })).toBe(false)
  })
})

describe('rejection', () => {
  test('keeps the draft, records the reason, and preserves the body and base', () => {
    const text = draftFor('abc', 'proposed body\n')
    const decision = decideReject({
      draftText: text,
      path: 'terms.md',
      reason: '  定义不准确 ',
      now: new Date('2026-11-15T04:05:06.000Z'),
    })
    expect(decision.ok).toBe(true)
    const parsed = parseDraft(decision.draftText)
    expect(parsed.draft.status).toBe('rejected')
    expect(parsed.draft.reason).toBe('定义不准确')
    expect(parsed.draft.base).toBe('abc')
    expect(parsed.draft.updated).toBe('2026-11-15T04:05:06.000Z')
    expect(parsed.body).toBe('proposed body\n')
    expect(parsed.page.title).toBe('术语表')
  })

  test('falls back to a generic reason when none is given', () => {
    const decision = decideReject({ draftText: draftFor('abc', 'x\n'), path: 'terms.md', reason: '' })
    expect(parseDraft(decision.draftText).draft.reason).toBe('rejected')
  })
})

describe('draft store effects', () => {
  test('writeDraft mirrors the path, records the base, and reports created then replaced', () => {
    const env = makeEnv()
    const scope = env.scopes.global()
    write(join(env.home, 'wiki', 'guide', 'setup.md'), PAGE)

    const first = env.core.writeDraft(scope, {
      path: 'guide/setup',
      content: '# 新正文',
      title: '安装',
      tags: 'a, b',
      status: 'wip',
      author: 'lead',
    })
    expect(first.ok).toBe(true)
    expect(first.draftPath).toBe('drafts/guide/setup.md')
    expect(first.base).toBe(sha1Hex(parsePage(PAGE).body))
    expect(first.created).toBe(true)
    expect(first.replaced).toBe(false)
    const file = join(env.home, 'wiki', 'drafts', 'guide', 'setup.md')
    expect(existsSync(file)).toBe(true)
    const parsed = parseDraft(readFileSync(file, 'utf8'))
    expect(parsed.page.title).toBe('安装')
    expect(parsed.page.tags).toEqual(['a', 'b'])
    expect(parsed.page.status).toBe('wip')
    expect(parsed.body).toBe('# 新正文')

    const second = env.core.writeDraft(scope, { path: 'guide/setup', content: '# 再改', author: 'lead' })
    expect(second.created).toBe(false)
    expect(second.replaced).toBe(true)
    // The single-draft rule: one file, overwritten in place.
    expect(parseDraft(readFileSync(file, 'utf8')).body).toBe('# 再改')
  })

  test('approve writes the page, deletes the draft, and bumps updated', () => {
    const env = makeEnv({ now: () => new Date('2026-11-15T05:00:00.000Z') })
    const scope = env.scopes.global()
    write(join(env.home, 'wiki', 'terms.md'), PAGE)
    env.core.writeDraft(scope, { path: 'terms.md', content: '新定义。\n', author: 'lead' })

    const approved = env.core.approve(scope, { path: 'terms.md', actor: 'lead' })
    expect(approved.ok).toBe(true)
    expect(approved.created).toBe(false)
    const page = parsePage(readFileSync(join(env.home, 'wiki', 'terms.md'), 'utf8'))
    expect(page.body).toBe('新定义。\n')
    expect(page.updated).toBe('2026-11-15')
    expect(page.title).toBe('术语表')
    expect(existsSync(join(env.home, 'wiki', 'drafts', 'terms.md'))).toBe(false)
  })

  test('reject rewrites the draft and leaves the page untouched', () => {
    const env = makeEnv({ now: () => new Date('2026-11-15T05:00:00.000Z') })
    const scope = env.scopes.global()
    write(join(env.home, 'wiki', 'terms.md'), PAGE)
    env.core.writeDraft(scope, { path: 'terms.md', content: 'x', author: 'lead' })

    const rejected = env.core.reject(scope, { path: 'terms.md', reason: '不准确' })
    expect(rejected.ok).toBe(true)
    expect(readFileSync(join(env.home, 'wiki', 'terms.md'), 'utf8')).toBe(PAGE)
    const draft = parseDraft(readFileSync(join(env.home, 'wiki', 'drafts', 'terms.md'), 'utf8'))
    expect(draft.draft.status).toBe('rejected')
    expect(draft.draft.reason).toBe('不准确')
  })

  test('approve reports not_found without a draft', () => {
    const env = makeEnv()
    const result = env.core.approve(env.scopes.global(), { path: 'none.md' })
    expect(result.ok).toBe(false)
    expect(result.code).toBe('not_found')
  })
})
