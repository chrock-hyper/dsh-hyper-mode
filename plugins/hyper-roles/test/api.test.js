/**
 * The panel's HTTP surface: authentication, optimistic concurrency and the
 * exact JSON contract the browser module consumes.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createApiHandler } from '../lib/api.js'

const home = mkdtempSync(join(tmpdir(), 'hyper-roles-api-'))
const project = join(home, 'project')
const bundleRoot = fileURLToPath(new URL('../../../', import.meta.url))

afterAll(() => {
  rmSync(home, { recursive: true, force: true })
})

/** @param remote - peer address. @returns a fake Host context. */
function makeCtx() {
  return {
    get(name) {
      if (name === 'connection') return undefined
      return undefined
    },
    logger: { info: () => {}, warn: () => {} },
  }
}

/** @returns a fake server response that records what was written. */
function makeRes() {
  const res = {
    status: 0,
    headers: {},
    text: '',
    writeHead(status, headers) {
      res.status = status
      Object.assign(res.headers, headers ?? {})
    },
    end(body) {
      res.text = body ?? ''
    },
    json() {
      return res.text === '' ? undefined : JSON.parse(res.text)
    },
  }
  return res
}

/** @param method - HTTP method. @param url - request URL. @param body - JSON body or raw string. @param remote - peer address. */
function makeReq(method, url, body, remote = '127.0.0.1') {
  const chunks = body === undefined ? [] : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body))]
  return {
    method,
    url,
    headers: {},
    socket: { remoteAddress: remote },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
}

/** @returns a handler bound to a fresh state object. */
function makeHandler() {
  const state = {
    config: { provider: 'spawn', maxRosterRoles: 20, briefMaxChars: 6000, selfSectionMaxChars: 1200, rosterSection: true, notesShown: 3 },
  }
  return createApiHandler({ ctx: makeCtx(), state, home, bundleRoot })
}

const handler = makeHandler()

/** @param method - verb. @param path - path. @param body - JSON body. */
async function call(method, path, body) {
  const res = makeRes()
  const url = path.includes('cwd=') ? path : `${path}${path.includes('?') ? '&' : '?'}cwd=${encodeURIComponent(project)}`
  await handler(makeReq(method, url, body), res)
  return res
}

describe('state', () => {
  test('lists both scopes, shipped roles and the effective config', async () => {
    const res = await call('GET', `/hyper-roles/api/state?cwd=${encodeURIComponent(project)}`)
    expect(res.status).toBe(200)
    const json = res.json()
    expect(json.ok).toBe(true)
    expect(json.projectRoot).toBe(project)
    expect(Array.isArray(json.roles.project)).toBe(true)
    expect(json.builtins.map((row) => row.id)).toContain('trainer')
    expect(json.config.provider).toBe('spawn')
  })
})

describe('role lifecycle', () => {
  test('creates, reads, saves and archives', async () => {
    const created = await call('POST', '/hyper-roles/api/role/project', {
      id: 'reviewer',
      title: '代码评审员',
      body: '## 职责\n看风险。',
      fields: { capabilities: ['静态分析'] },
    })
    expect(created.status).toBe(200)
    expect(created.json().revision).toBe(1)

    const read = await call('GET', '/hyper-roles/api/role/project/reviewer')
    expect(read.status).toBe(200)
    expect(read.json().fields.title).toBe('代码评审员')
    expect(read.json().fields.capabilities).toEqual(['静态分析'])

    const saved = await call('PUT', '/hyper-roles/api/role/project/reviewer', {
      body: '## 职责\n看风险与回归。',
      expectedVersion: 1,
    })
    expect(saved.status).toBe(200)
    expect(saved.json().revision).toBe(2)

    const archived = await call('POST', '/hyper-roles/api/role/project/reviewer/archive', {})
    expect(archived.status).toBe(200)
    expect(archived.json().archivedTo).toContain('.archive')
  })

  test('reports a stale write as 409 with the current version', async () => {
    await call('POST', '/hyper-roles/api/role/project', { id: 'architect', title: '架构师', body: '' })
    const conflict = await call('PUT', '/hyper-roles/api/role/project/architect', { title: 'x', expectedVersion: 9 })
    expect(conflict.status).toBe(409)
    expect(conflict.json()).toEqual(expect.objectContaining({ code: 'stale', currentVersion: 1 }))
  })

  test('reports a duplicate create as 409', async () => {
    const duplicate = await call('POST', '/hyper-roles/api/role/project', { id: 'architect', title: '架构师', body: '' })
    expect(duplicate.status).toBe(409)
    expect(duplicate.json().code).toBe('exists')
  })

  test('copies a shipped role into a scope', async () => {
    const copied = await call('POST', '/hyper-roles/api/role/project', { fromBuiltin: 'trainer' })
    expect(copied.status).toBe(200)
    expect(copied.json().id).toBe('trainer')
  })

  test('appends an experience note', async () => {
    const note = await call('POST', '/hyper-roles/api/role/project/architect/note', { text: '先画边界再谈实现' })
    expect(note.status).toBe(200)
    const read = await call('GET', '/hyper-roles/api/role/project/architect')
    expect(read.json().notes.at(-1).text).toBe('先画边界再谈实现')
  })
})

describe('guard and errors', () => {
  test('refuses a non-loopback peer when no connection carrier exists', async () => {
    const res = makeRes()
    await handler(makeReq('GET', '/hyper-roles/api/state', undefined, '10.0.0.7'), res)
    expect(res.status).toBe(403)
  })

  test('answers 404 for an unknown path and 400 for a non-JSON body', async () => {
    expect((await call('GET', '/hyper-roles/api/nope')).status).toBe(404)
    const res = makeRes()
    await handler(makeReq('PUT', '/hyper-roles/api/config', 'not json'), res)
    expect(res.status).toBe(400)
  })

  test('rejects an oversized body', async () => {
    const res = makeRes()
    const huge = { text: 'x'.repeat(300 * 1024) }
    await handler(makeReq('POST', '/hyper-roles/api/role/project/architect/note', huge), res)
    expect(res.status).toBe(400)
  })
})

describe('config', () => {
  test('merges a patch and mirrors it into the live state', async () => {
    const res = await call('PUT', '/hyper-roles/api/config', { patch: { notesShown: 5, bogus: 1 } })
    expect(res.status).toBe(200)
    expect(res.json().config.notesShown).toBe(5)
    expect(res.json().config.bogus).toBeUndefined()
  })
})
