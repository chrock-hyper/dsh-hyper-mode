import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

import { authorizeRequest, cwdOfSession } from '../index.js'
import { createWikiApi, isLoopbackAddress, MAX_BODY_BYTES, statusFor } from '../lib/api.js'
import { parsePage, serializePage, sha1Hex } from '../lib/page.js'
import { call, makeEnv, quietLogger, write } from './helpers.js'

/** A page document used across the route tests. */
const PAGE = serializePage({ title: '安装', tags: ['guide'], status: 'stable', updated: '2026-11-01', body: 'old body' })

/**
 * Build the router for one environment.
 * @param env - fixture.
 * @param options - `authorize` override.
 * @returns the node handler.
 */
function router(env, options = {}) {
  return createWikiApi({
    core: env.core,
    scopes: env.scopes,
    logger: quietLogger(),
    authorize: options.authorize,
  }).handler
}

describe('authorization', () => {
  test('recognizes loopback addresses only', () => {
    for (const address of ['127.0.0.1', '127.9.9.9', '::1', '::ffff:127.0.0.1']) {
      expect(isLoopbackAddress(address)).toBe(true)
    }
    for (const address of ['10.0.0.4', '192.168.1.2', '::ffff:10.0.0.4', '', undefined, 'localhost']) {
      expect(isLoopbackAddress(address)).toBe(false)
    }
  })

  test('serves loopback callers and refuses every other peer', () => {
    expect(authorizeRequest({ socket: { remoteAddress: '127.0.0.1' } })).toBeUndefined()
    expect(authorizeRequest({ socket: { remoteAddress: '::1' } })).toBeUndefined()
    expect(authorizeRequest({ socket: { remoteAddress: '10.1.2.3' } })).toBe(401)
    expect(authorizeRequest({})).toBe(401)
  })

  test('resolves the project directory from a session id', () => {
    const session = { id: 'sess-1' }
    const ctx = {
      get(name) {
        if (name === 'sessions') return { get: id => (id === 'sess-1' ? session : undefined) }
        if (name === 'workingDirectory') return { get: () => '/tmp/project' }
        return undefined
      },
    }
    expect(cwdOfSession(ctx, 'sess-1')).toBe('/tmp/project')
    expect(cwdOfSession(ctx, 'missing')).toBeUndefined()
    expect(cwdOfSession(ctx, null)).toBeUndefined()
  })

  test('rejects with the status the authorizer returns', async () => {
    const env = makeEnv()
    const result = await call(router(env, { authorize: () => 401 }), { url: '/wiki/state' })
    expect(result.status).toBe(401)
    expect(result.text).toBe('')
  })
})

describe('read routes', () => {
  test('state reports both scopes, presence, and recent projects', async () => {
    const env = makeEnv()
    write(join(env.home, 'wiki', 'a.md'), PAGE)
    const result = await call(router(env), { url: `/wiki/state?cwd=${encodeURIComponent(env.workspace)}` })
    expect(result.status).toBe(200)
    expect(result.json.ok).toBe(true)
    expect(result.json.scopes.map(row => row.scope)).toEqual(['global', 'project'])
    expect(result.json.scopes[0].exists).toBe(true)
    expect(result.json.scopes[1].exists).toBe(false)
    expect(result.json.recentProjects).toEqual([])
  })

  test('pages lists one scope', async () => {
    const env = makeEnv()
    write(join(env.home, 'wiki', 'a.md'), PAGE)
    const result = await call(router(env), { url: '/wiki/pages?scope=global' })
    expect(result.status).toBe(200)
    expect(result.json.pages.map(row => row.path)).toEqual(['a.md'])
  })

  test('page returns the body, and 404 when it is absent', async () => {
    const env = makeEnv()
    write(join(env.home, 'wiki', 'a.md'), PAGE)
    const found = await call(router(env), { url: '/wiki/page?scope=global&path=a.md' })
    expect(found.status).toBe(200)
    expect(found.json.title).toBe('安装')

    const missing = await call(router(env), { url: '/wiki/page?scope=global&path=nope.md' })
    expect(missing.status).toBe(404)
    expect(missing.json.code).toBe('not_found')
  })

  test('pending counts drafts for the badge', async () => {
    const env = makeEnv()
    write(join(env.home, 'wiki', 'a.md'), PAGE)
    env.core.writeDraft(env.scopes.global(), { path: 'a.md', content: 'new', author: 'lead' })
    const result = await call(router(env), { url: '/wiki/pending' })
    expect(result.status).toBe(200)
    expect(result.json.total).toBe(1)
    expect(result.json.scopes[0].pending).toBe(1)
  })

  test('a project scope without a cwd is a bad request', async () => {
    const env = makeEnv()
    const result = await call(router(env), { url: '/wiki/pages?scope=project' })
    expect(result.status).toBe(400)
    expect(result.json.code).toBe('wrong_scope')
  })

  test('drafts and search answer with lists', async () => {
    const env = makeEnv()
    write(join(env.home, 'wiki', 'guide', 'setup.md'), serializePage({ title: 'deploy guide', body: 'x' }))
    env.core.writeDraft(env.scopes.global(), { path: 'guide/setup.md', content: 'y', author: 'lead' })
    const drafts = await call(router(env), { url: '/wiki/drafts?scope=global' })
    expect(drafts.json.drafts.map(row => row.path)).toEqual(['guide/setup.md'])
    // The list carries metadata only: no whole-draft payload.
    expect(drafts.json.drafts[0].text).toBeUndefined()
    const search = await call(router(env), { url: '/wiki/search?scope=global&q=deploy' })
    expect(search.status).toBe(200)
    expect(search.json.results.length).toBe(1)
  })

  test('an unknown route is 404', async () => {
    const env = makeEnv()
    const result = await call(router(env), { url: '/wiki/nope' })
    expect(result.status).toBe(404)
    expect(result.json.code).toBe('not_found')

    const outside = await call(router(env), { url: '/other' })
    expect(outside.status).toBe(404)
  })
})

describe('write routes', () => {
  test('draft, approve, then page shows the new body', async () => {
    const env = makeEnv()
    write(join(env.home, 'wiki', 'a.md'), PAGE)
    const handler = router(env)

    const drafted = await call(handler, {
      method: 'POST',
      url: '/wiki/draft?scope=global',
      headers: { 'content-type': 'application/json' },
      body: { path: 'a.md', content: 'new body', title: '安装', author: 'lead' },
    })
    expect(drafted.status).toBe(200)
    expect(drafted.json.draftPath).toBe('drafts/a.md')
    expect(drafted.json.base).toBe(sha1Hex(parsePage(PAGE).body))

    const approved = await call(handler, {
      method: 'POST',
      url: '/wiki/approve?scope=global',
      headers: { 'content-type': 'application/json' },
      body: { path: 'a.md', actor: 'tester' },
    })
    expect(approved.status).toBe(200)
    expect(approved.json.created).toBe(false)

    const page = await call(handler, { url: '/wiki/page?scope=global&path=a.md' })
    expect(page.json.body).toBe('new body')
    expect(page.json.draft).toBeNull()
  })

  test('a stale draft is 409 and force overrides it', async () => {
    const env = makeEnv()
    write(join(env.home, 'wiki', 'a.md'), PAGE)
    env.core.writeDraft(env.scopes.global(), { path: 'a.md', content: 'draft body', author: 'lead' })
    // Someone else changes the page after the draft was written.
    write(join(env.home, 'wiki', 'a.md'), serializePage({ title: '安装', body: 'changed later' }))
    const handler = router(env)

    const conflict = await call(handler, {
      method: 'POST',
      url: '/wiki/approve?scope=global',
      headers: { 'content-type': 'application/json' },
      body: { path: 'a.md' },
    })
    expect(conflict.status).toBe(409)
    expect(conflict.json.code).toBe('conflict')

    const forced = await call(handler, {
      method: 'POST',
      url: '/wiki/approve?scope=global',
      headers: { 'content-type': 'application/json' },
      body: { path: 'a.md', force: true },
    })
    expect(forced.status).toBe(200)
    expect(forced.json.forced).toBe(true)
  })

  test('reject keeps the draft with its reason', async () => {
    const env = makeEnv()
    write(join(env.home, 'wiki', 'a.md'), PAGE)
    env.core.writeDraft(env.scopes.global(), { path: 'a.md', content: 'x', author: 'lead' })
    const result = await call(router(env), {
      method: 'POST',
      url: '/wiki/reject?scope=global',
      headers: { 'content-type': 'application/json' },
      body: { path: 'a.md', reason: '不准确' },
    })
    expect(result.status).toBe(200)
    expect(result.json.reason).toBe('不准确')
  })

  test('an invalid path is 400 and a missing draft is 404', async () => {
    const env = makeEnv()
    const handler = router(env)
    const invalid = await call(handler, {
      method: 'POST',
      url: '/wiki/draft?scope=global',
      headers: { 'content-type': 'application/json' },
      body: { path: 'drafts/escape.md', content: 'x' },
    })
    expect(invalid.status).toBe(400)
    expect(invalid.json.code).toBe('invalid_path')

    const missing = await call(handler, {
      method: 'POST',
      url: '/wiki/approve?scope=global',
      headers: { 'content-type': 'application/json' },
      body: { path: 'none.md' },
    })
    expect(missing.status).toBe(404)
  })

  test('delete and rename move files and report backlinks', async () => {
    const env = makeEnv()
    write(join(env.home, 'wiki', 'index.md'), serializePage({ title: '首页', body: '[a](./a.md)' }))
    write(join(env.home, 'wiki', 'a.md'), PAGE)
    const handler = router(env)

    const renamed = await call(handler, {
      method: 'POST',
      url: '/wiki/rename?scope=global',
      headers: { 'content-type': 'application/json' },
      body: { from: 'a.md', to: 'b.md' },
    })
    expect(renamed.status).toBe(200)
    expect(renamed.json.backlinks).toEqual([{ path: 'index.md', title: '首页' }])

    const deleted = await call(handler, {
      method: 'POST',
      url: '/wiki/delete?scope=global',
      headers: { 'content-type': 'application/json' },
      body: { path: 'b.md' },
    })
    expect(deleted.status).toBe(200)
    expect(deleted.json.trashPath.startsWith('.trash/b.md.')).toBe(true)
  })

  test('the panel can save a page directly', async () => {
    const env = makeEnv()
    const result = await call(router(env), {
      method: 'POST',
      url: '/wiki/page?scope=global',
      headers: { 'content-type': 'application/json' },
      body: { path: 'new/page.md', content: '---\ntitle: 新页面\n---\n\n正文' },
    })
    expect(result.status).toBe(200)
    expect(result.json.created).toBe(true)
    const read = await call(router(env), { url: '/wiki/page?scope=global&path=new/page.md' })
    expect(read.json.title).toBe('新页面')
  })
})

describe('request hygiene', () => {
  test('a non-JSON body is 400', async () => {
    const env = makeEnv()
    const result = await call(router(env), {
      method: 'POST',
      url: '/wiki/draft?scope=global',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    })
    expect(result.status).toBe(400)
    expect(result.json.code).toBe('bad_json')
  })

  test('a body past the ceiling is 413', async () => {
    const env = makeEnv()
    const oversized = 'x'.repeat(MAX_BODY_BYTES + 1024)
    const result = await call(router(env), {
      method: 'POST',
      url: '/wiki/draft?scope=global',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'a.md', content: oversized }),
    })
    expect(result.status).toBe(413)
    expect(result.json.code).toBe('payload_too_large')
  })

  test('an unsupported method is 405 with an allow header', async () => {
    const env = makeEnv()
    const handler = router(env)
    const pages = await call(handler, { method: 'PUT', url: '/wiki/pages' })
    expect(pages.status).toBe(405)
    expect(pages.headers.allow).toBe('GET')

    const state = await call(handler, { method: 'POST', url: '/wiki/state', body: {} })
    expect(state.status).toBe(405)
    expect(state.headers.allow).toBe('GET')
  })

  test('maps store failure codes onto statuses', () => {
    expect(statusFor('not_found')).toBe(404)
    expect(statusFor('conflict')).toBe(409)
    expect(statusFor('exists')).toBe(409)
    expect(statusFor('invalid_path')).toBe(400)
    expect(statusFor('write_failed')).toBe(500)
  })
})
