/**
 * The order board's HTTP surface: the loopback guard, the read contract the
 * panel renders, and — in the second half — every gate the store and the rules
 * enforce, asserted through the same routes the buttons call.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { resolveDirs } from '../../hyper-roles/lib/scopes.js'
import { createRole } from '../../hyper-roles/lib/store.js'
import { createApiHandler } from '../lib/api.js'
import { createOrder, orgDirs, saveOrder, signOrder } from '../lib/store.js'

/** Every sandbox root created here, removed once at the end. */
const roots = []

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

/**
 * A fresh project with a handler bound to it.
 * @param options - config overrides and the live sessions the resolver knows.
 * @returns the sandbox, with request helpers already bound.
 */
function sandbox(options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'hyper-org-api-'))
  roots.push(root)
  const home = join(root, 'home')
  const project = join(root, 'project')
  mkdirSync(project, { recursive: true })
  const roleDirs = resolveDirs({ home, cwd: project })
  const dirs = orgDirs(roleDirs)
  const config = { wipLimit: 2, pulseRows: 3, boardSection: true, ...options.config }
  const sessions = options.sessions ?? {
    'sess-lead': { cwd: project },
    'sess-eng': { cwd: project, role: 'engineer' },
  }
  const handler = createApiHandler({
    home,
    config,
    resolveSession: (id) => sessions[id],
  })

  const context = {
    root,
    home,
    project,
    roleDirs,
    dirs,
    config,
    handler,
    /** @param id - role id. @param title - display title. @param scope - where it lands. */
    role(id, title, scope = 'project') {
      createRole(roleDirs, { scope, id, title, body: `## 职责\n${title}。` })
    },
    /** @param input - create overrides. @returns the created record. */
    order(input = {}) {
      return createOrder(dirs, {
        title: '一张工单',
        acceptance: ['可判定'],
        by: 'lead',
        wipLimit: config.wipLimit,
        ...input,
      })
    },
    /**
     * Call one route.
     * @param method - verb.
     * @param path - path under the prefix.
     * @param options - query values, JSON body and peer address.
     * @returns the collected response.
     */
    async call(method, path, options = {}) {
      const res = makeRes()
      const query = new URLSearchParams()
      for (const [key, value] of Object.entries(options.query ?? {})) {
        if (value !== undefined) query.set(key, String(value))
      }
      const text = query.toString()
      const url = text === '' ? `/hyper-org/api${path}` : `/hyper-org/api${path}?${text}`
      await handler(makeReq(method, url, options.body, options.remote), res)
      return res
    },
  }
  return context
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

/** @param method - verb. @param url - full URL. @param body - JSON body. @param remote - peer address. */
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

describe('guard and routing', () => {
  test('refuses a non-loopback peer', async () => {
    const app = sandbox()
    const res = await app.call('GET', '/state', { remote: '10.0.0.7' })
    expect(res.status).toBe(401)
    expect(res.json().code).toBe('unauthorized')
  })

  test('answers 404 for an unknown route and 405 for a wrong method', async () => {
    const app = sandbox()
    expect((await app.call('GET', '/nope')).status).toBe(404)
    const wrong = await app.call('POST', '/state')
    expect(wrong.status).toBe(405)
    expect(wrong.json().code).toBe('method_not_allowed')
    expect((await app.call('PUT', '/order')).status).toBe(405)
  })

  test('refuses a traversing id before touching the filesystem', async () => {
    const app = sandbox()
    const res = await app.call('GET', '/order', { query: { id: '../wo-20261115-1' } })
    expect(res.status).toBe(400)
    expect(res.json().code).toBe('bad_id')
  })
})

describe('GET /state', () => {
  test('reports no project root when no session can be read', async () => {
    const app = sandbox()
    const res = await app.call('GET', '/state')
    expect(res.status).toBe(200)
    const json = res.json()
    expect(json.projectRoot).toBeNull()
    expect(json.projectDir).toBeNull()
    expect(json.actor).toEqual({ role: null, label: 'lead', confirmed: false })
  })

  test('lists orders with stage, size, DRI title, scope, age and slot usage', async () => {
    const app = sandbox()
    app.role('engineer', '工程师')
    app.role('reviewer', '验收评审员', 'global')
    const live = app.order({ title: '看板那单', size: 'M', dri: 'engineer' })
    // Ids are per scope: burn one number in the global scope so the pair does
    // not shadow each other, which is the documented behavior under test.
    app.order({ title: '全局占位', size: 'M', acceptance: [], scope: 'global' })
    const globalOne = app.order({ title: '全局那单', size: 'M', acceptance: [], scope: 'global' })
    const res = await app.call('GET', '/state', { query: { session: 'sess-lead' } })
    expect(res.status).toBe(200)
    const json = res.json()

    expect(json.projectRoot).toBe(app.project)
    expect(json.wipLimit).toBe(2)
    expect(json.occupied).toBe(1)
    expect(json.stages).toEqual(['intake', 'active', 'review', 'blocked', 'done', 'dropped'])
    expect(json.actor).toEqual({ role: null, label: 'lead', confirmed: true })

    const liveRow = json.orders.find((row) => row.id === live.order.id)
    expect(liveRow).toEqual(expect.objectContaining({
      title: '看板那单',
      stage: 'active',
      size: 'M',
      dri: 'engineer',
      driTitle: '工程师',
      scope: 'project',
      acceptanceCount: 1,
      occupiesSlot: true,
    }))
    expect(typeof liveRow.age).toBe('string')

    const globalRow = json.orders.find((row) => row.id === globalOne.order.id)
    expect(globalRow.scope).toBe('global')

    expect(json.roles).toEqual(expect.arrayContaining([
      { id: 'engineer', title: '工程师', scope: 'project' },
      { id: 'reviewer', title: '验收评审员', scope: 'global' },
    ]))
    expect(json.problems).toEqual([])
  })

  test('reports the bound role as the acting identity', async () => {
    const app = sandbox()
    app.role('engineer', '工程师')
    const res = await app.call('GET', '/state', { query: { session: 'sess-eng' } })
    expect(res.json().actor).toEqual({ role: 'engineer', label: 'engineer', confirmed: true })
  })

  test('keeps the board readable when one order file cannot be parsed', async () => {
    const app = sandbox()
    app.order({ title: '好的那单' })
    mkdirSync(join(app.dirs.projectDir, 'orders'), { recursive: true })
    writeFileSync(join(app.dirs.projectDir, 'orders', 'wo-20261115-99.json'), '{ not json', 'utf8')
    const json = (await app.call('GET', '/state', { query: { session: 'sess-lead' } })).json()
    expect(json.orders).toHaveLength(1)
    expect(json.problems).toHaveLength(1)
    expect(json.problems[0].path).toContain('wo-20261115-99.json')
  })
})

describe('GET /order', () => {
  test('returns the six detail items and the sign preview', async () => {
    const app = sandbox()
    app.role('engineer', '工程师')
    const created = app.order({ title: '看板那单', size: 'M', dri: 'engineer', acceptance: ['跑通', '不打折'] })
    writeFileSync(join(app.project, 'report.md'), '# 报告\n', 'utf8')
    saveOrder(app.dirs, { id: created.order.id, by: 'lead', patch: { artifacts: ['report.md', 'gone.md'] } })

    const res = await app.call('GET', '/order', { query: { session: 'sess-lead', id: created.order.id } })
    expect(res.status).toBe(200)
    const json = res.json()
    expect(json.ok).toBe(true)
    expect(json.scope).toBe('project')
    expect(json.path).toContain(`${created.order.id}.json`)
    expect(json.driTitle).toBe('工程师')
    expect(typeof json.age).toBe('string')
    expect(json.order.stage).toBe('active')
    expect(json.order.size).toBe('M')
    expect(json.order.dri).toBe('engineer')
    expect(json.order.acceptance).toEqual(['跑通', '不打折'])
    expect(json.order.log.length).toBeGreaterThan(0)
    expect(json.artifacts).toEqual([
      { path: 'report.md', kind: 'file', bytes: 9 },
      { path: 'gone.md', kind: 'missing' },
    ])
    expect(json.sign.allowed).toBe(false)
    expect(json.sign.blockers.map((entry) => entry.code)).toEqual(['not_review'])
  })

  test('returns the whole log, not the model-facing excerpt', async () => {
    const app = sandbox()
    const created = app.order({ title: '日志很长', size: 'S' })
    for (let index = 0; index < 8; index += 1) {
      saveOrder(app.dirs, { id: created.order.id, by: 'lead', patch: { note: `第 ${index} 次更新` } })
    }
    const json = (await app.call('GET', '/order', { query: { session: 'sess-lead', id: created.order.id } })).json()
    expect(json.order.log).toHaveLength(9)
    expect(json.order.log.at(-1).note).toContain('第 7 次更新')
  })

  test('reports the self-sign and acceptance blockers for the DRI itself', async () => {
    const app = sandbox()
    app.role('engineer', '工程师')
    const created = app.order({ title: '自己签', size: 'S', dri: 'engineer', acceptance: [] })
    saveOrder(app.dirs, { id: created.order.id, by: 'lead', patch: { stage: 'review' } })
    const json = (await app.call('GET', '/order', { query: { session: 'sess-eng', id: created.order.id } })).json()
    expect(json.sign.blockers.map((entry) => entry.code)).toEqual(['self_sign', 'no_acceptance'])
  })

  test('answers 404 for an unknown id', async () => {
    const app = sandbox()
    const res = await app.call('GET', '/order', { query: { id: 'wo-20261115-404' } })
    expect(res.status).toBe(404)
    expect(res.json().code).toBe('order_not_found')
  })
})

describe('GET /artifact', () => {
  test('previews a file the order declares, and refuses everything else', async () => {
    const app = sandbox()
    const created = app.order({ title: '带交付物', size: 'S' })
    writeFileSync(join(app.project, 'notes.md'), '# 结论\n一切正常\n', 'utf8')
    mkdirSync(join(app.project, 'folder'), { recursive: true })
    writeFileSync(join(app.project, 'binary.dat'), Buffer.from([0x00, 0x01, 0x02]))
    saveOrder(app.dirs, {
      id: created.order.id,
      by: 'lead',
      patch: { artifacts: ['notes.md', 'folder', 'binary.dat', '../outside.txt'] },
    })
    const query = { session: 'sess-lead', id: created.order.id }

    const ok = await app.call('GET', '/artifact', { query: { ...query, path: 'notes.md' } })
    expect(ok.status).toBe(200)
    expect(ok.json()).toEqual(expect.objectContaining({ ok: true, path: 'notes.md', truncated: false }))
    expect(ok.json().text).toContain('一切正常')

    const undeclared = await app.call('GET', '/artifact', { query: { ...query, path: 'package.json' } })
    expect(undeclared.status).toBe(400)
    expect(undeclared.json().code).toBe('not_declared')

    const escape = await app.call('GET', '/artifact', { query: { ...query, path: '../outside.txt' } })
    expect(escape.status).toBe(400)
    expect(escape.json().code).toBe('path_escape')

    const directory = await app.call('GET', '/artifact', { query: { ...query, path: 'folder' } })
    expect(directory.status).toBe(409)
    expect(directory.json().code).toBe('is_directory')

    const binary = await app.call('GET', '/artifact', { query: { ...query, path: 'binary.dat' } })
    expect(binary.status).toBe(415)
    expect(binary.json().code).toBe('binary')
  })

  test('answers 404 when the order is gone', async () => {
    const app = sandbox()
    const res = await app.call('GET', '/artifact', { query: { id: 'wo-20261115-404', path: 'a.txt' } })
    expect(res.status).toBe(404)
  })
})

describe('sign-off on the record', () => {
  test('a signed order keeps the note in its log', async () => {
    const app = sandbox()
    const created = app.order({ title: '待签', size: 'S' })
    saveOrder(app.dirs, { id: created.order.id, by: 'lead', patch: { stage: 'review' } })
    const signed = signOrder(app.dirs, { id: created.order.id, approved: true, by: 'lead', note: '验收标准满足' })
    expect(signed.stage).toBe('done')
    expect(signed.log.at(-1).note).toContain('验收标准满足')
  })
})

describe('POST /order', () => {
  test('queues new work in intake when the slot budget is full', async () => {
    const app = sandbox({ config: { wipLimit: 1 } })
    app.order({ title: '占满在制', size: 'S', acceptance: ['可判定'] })
    const res = await app.call('POST', '/order', {
      query: { session: 'sess-lead' },
      body: { title: '再来一张', size: 'S', acceptance: ['可判定'] },
    })
    expect(res.status).toBe(200)
    const json = res.json()
    expect(json.downgraded).toBe(true)
    expect(json.reason).toBe('wip')
    expect(json.order.stage).toBe('intake')
    expect(json.occupied).toBe(1)
    expect(json.wipLimit).toBe(1)
    expect(json.notes.join(' ')).toContain('在制已满 1 张')
  })

  test('queues medium work without acceptance criteria, but not small work', async () => {
    const app = sandbox()
    const medium = (await app.call('POST', '/order', {
      query: { session: 'sess-lead' },
      body: { title: '没有标准', size: 'M' },
    })).json()
    expect(medium.downgraded).toBe(true)
    expect(medium.reason).toBe('acceptance')
    expect(medium.order.stage).toBe('intake')
    expect(medium.order.acceptance).toEqual([])

    const small = (await app.call('POST', '/order', {
      query: { session: 'sess-lead' },
      body: { title: '小修', size: 'S' },
    })).json()
    expect(small.downgraded).toBe(false)
    expect(small.order.stage).toBe('active')
  })

  test('records the bound role as the log label, never a client-supplied actor', async () => {
    const app = sandbox()
    app.role('engineer', '工程师')
    const res = await app.call('POST', '/order', {
      query: { session: 'sess-eng' },
      body: { title: '工程师建单', size: 'S', by: 'someone-else' },
    })
    expect(res.status).toBe(200)
    expect(res.json().order.log[0].by).toBe('engineer')
  })

  test('accepts a multi-line acceptance body and keeps the commas', async () => {
    const app = sandbox()
    const res = await app.call('POST', '/order', {
      query: { session: 'sess-lead' },
      body: { title: '带标准', size: 'M', acceptance: '纯静态，无网络\nCanvas 绘制' },
    })
    expect(res.json().order.acceptance).toEqual(['纯静态，无网络', 'Canvas 绘制'])
    expect(res.json().order.stage).toBe('active')
  })

  test('refuses an unknown DRI, size, scope and an empty title', async () => {
    const app = sandbox()
    app.role('engineer', '工程师')
    const query = { session: 'sess-lead' }

    const dri = await app.call('POST', '/order', { query, body: { title: 'x', size: 'S', dri: 'ghost' } })
    expect(dri.status).toBe(400)
    expect(dri.json().code).toBe('unknown_role')
    expect(dri.json().error).toContain('岗位 "ghost" 不存在')

    const size = await app.call('POST', '/order', { query, body: { title: 'x', size: 'XL' } })
    expect(size.status).toBe(400)
    expect(size.json().code).toBe('bad_size')

    const scope = await app.call('POST', '/order', { query, body: { title: 'x', size: 'S', scope: 'elsewhere' } })
    expect(scope.status).toBe(400)
    expect(scope.json().code).toBe('bad_scope')

    const title = await app.call('POST', '/order', { query, body: { title: '   ', size: 'S' } })
    expect(title.status).toBe(400)
    expect(title.json().code).toBe('bad_title')
  })

  test('refuses a project create when the session has no project root', async () => {
    const app = sandbox({ sessions: {} })
    const res = await app.call('POST', '/order', {
      query: { session: 'sess-gone' },
      body: { title: '写项目', size: 'S', scope: 'project' },
    })
    expect(res.status).toBe(400)
    expect(res.json().code).toBe('no_project')
  })

  test('answers bad_body for malformed and oversized bodies', async () => {
    const app = sandbox()
    const malformed = await app.call('POST', '/order', { body: 'not json' })
    expect(malformed.status).toBe(400)
    expect(malformed.json().code).toBe('bad_body')

    const huge = await app.call('POST', '/order', { body: { title: 'x'.repeat(300 * 1024), size: 'S' } })
    expect(huge.status).toBe(400)
    expect(huge.json().code).toBe('bad_body')
  })
})

describe('PATCH /order/:id', () => {
  test('refuses a direct done and an unjudgeable promotion', async () => {
    const app = sandbox()
    const created = app.order({ title: '待改', size: 'M', acceptance: [] })
    const done = await app.call('PATCH', `/order/${created.order.id}`, {
      query: { session: 'sess-lead' },
      body: { stage: 'done' },
    })
    expect(done.status).toBe(409)
    expect(done.json().code).toBe('done_forbidden')

    const promote = await app.call('PATCH', `/order/${created.order.id}`, {
      query: { session: 'sess-lead' },
      body: { stage: 'active' },
    })
    expect(promote.status).toBe(409)
    expect(promote.json().code).toBe('acceptance_gate')
  })

  test('saves a stage change with a note and appends artifacts', async () => {
    const app = sandbox()
    const created = app.order({ title: '推进', size: 'S' })
    const res = await app.call('PATCH', `/order/${created.order.id}`, {
      query: { session: 'sess-lead' },
      body: { stage: 'review', artifacts: 'out/a.md, out/b.md', note: '交付物挂上了' },
    })
    expect(res.status).toBe(200)
    const json = res.json()
    expect(json.order.stage).toBe('review')
    expect(json.order.artifacts).toEqual(['out/a.md', 'out/b.md'])
    expect(json.order.log.at(-1).note).toBe('stage active → review: 交付物挂上了')
    expect(json.sign.blockers.map((entry) => entry.code)).toEqual([])
  })

  test('refuses an unknown stage, a wrong id shape and a missing order', async () => {
    const app = sandbox()
    const created = app.order({ title: '改阶段', size: 'S' })
    const stage = await app.call('PATCH', `/order/${created.order.id}`, {
      query: { session: 'sess-lead' },
      body: { stage: 'doing' },
    })
    expect(stage.status).toBe(400)
    expect(stage.json().code).toBe('bad_stage')

    const evil = await app.call('PATCH', '/order/..%2F..%2Fetc', { query: { session: 'sess-lead' }, body: {} })
    expect(evil.status).toBe(400)
    expect(evil.json().code).toBe('bad_id')

    const gone = await app.call('PATCH', '/order/wo-20261115-404', { query: { session: 'sess-lead' }, body: {} })
    expect(gone.status).toBe(404)
    expect(gone.json().code).toBe('order_not_found')
  })

  test('refuses an unknown DRI', async () => {
    const app = sandbox()
    const created = app.order({ title: '指派', size: 'S' })
    const res = await app.call('PATCH', `/order/${created.order.id}`, {
      query: { session: 'sess-lead' },
      body: { dri: 'ghost' },
    })
    expect(res.status).toBe(400)
    expect(res.json().code).toBe('unknown_role')
  })
})

describe('POST /order/:id/sign', () => {
  /** @param app - sandbox. @param input - order fields. @returns the review-stage order. */
  function reviewOrder(app, input = {}) {
    const created = app.order({ title: '待验收', size: 'S', acceptance: ['可判定'], ...input })
    saveOrder(app.dirs, { id: created.order.id, by: 'lead', patch: { stage: 'review' } })
    return created
  }

  test('demands a note', async () => {
    const app = sandbox()
    const created = reviewOrder(app)
    const res = await app.call('POST', `/order/${created.order.id}/sign`, {
      query: { session: 'sess-lead' },
      body: { approve: true },
    })
    expect(res.status).toBe(400)
    expect(res.json().code).toBe('note_required')
    expect(res.json().error).toContain('sign 需要 note')
  })

  test('refuses the DRI itself', async () => {
    const app = sandbox()
    app.role('engineer', '工程师')
    const created = reviewOrder(app, { dri: 'engineer' })
    const res = await app.call('POST', `/order/${created.order.id}/sign`, {
      query: { session: 'sess-eng' },
      body: { approve: true, note: '自查通过' },
    })
    expect(res.status).toBe(403)
    expect(res.json().code).toBe('self_sign')
    expect(res.json().error).toContain('验收不能由领取人自己签')
  })

  test('lets an unbound lead sign an order assigned to someone else', async () => {
    const app = sandbox()
    app.role('engineer', '工程师')
    const created = reviewOrder(app, { dri: 'engineer' })
    const res = await app.call('POST', `/order/${created.order.id}/sign`, {
      query: { session: 'sess-lead' },
      body: { approve: true, note: '我复核过' },
    })
    expect(res.status).toBe(200)
    expect(res.json().order.stage).toBe('done')
    expect(res.json().order.log.at(-1).by).toBe('lead')
  })

  test('refuses a non-review order and a sign-off without criteria', async () => {
    const app = sandbox()
    const active = app.order({ title: '还在做', size: 'S', acceptance: ['可判定'] })
    const notReview = await app.call('POST', `/order/${active.order.id}/sign`, {
      query: { session: 'sess-lead' },
      body: { approve: true, note: '提前签' },
    })
    expect(notReview.status).toBe(409)
    expect(notReview.json().code).toBe('not_review')

    const empty = reviewOrder(app, { title: '没有标准', acceptance: [] })
    const noCriteria = await app.call('POST', `/order/${empty.order.id}/sign`, {
      query: { session: 'sess-lead' },
      body: { approve: true, note: '签了' },
    })
    expect(noCriteria.status).toBe(409)
    expect(noCriteria.json().code).toBe('no_acceptance')
  })

  test('closes the order, keeps the note and answers with the signed card', async () => {
    const app = sandbox()
    const created = reviewOrder(app)
    const res = await app.call('POST', `/order/${created.order.id}/sign`, {
      query: { session: 'sess-lead' },
      body: { approve: true, note: '六条都验过' },
    })
    expect(res.status).toBe(200)
    const json = res.json()
    expect(json.order.stage).toBe('done')
    expect(json.order.log.at(-1).note).toContain('六条都验过')
    expect(json.sign.blockers.map((entry) => entry.code)).toEqual(['not_review'])
  })

  test('sending back returns the order to active', async () => {
    const app = sandbox()
    const created = reviewOrder(app)
    const res = await app.call('POST', `/order/${created.order.id}/sign`, {
      query: { session: 'sess-lead' },
      body: { approve: false, note: '日志没写结论' },
    })
    expect(res.status).toBe(200)
    expect(res.json().order.stage).toBe('active')
  })

  test('requires a boolean approve', async () => {
    const app = sandbox()
    const created = reviewOrder(app)
    const res = await app.call('POST', `/order/${created.order.id}/sign`, {
      query: { session: 'sess-lead' },
      body: { note: '没有 approve' },
    })
    expect(res.status).toBe(400)
    expect(res.json().code).toBe('bad_body')
  })
})

describe('data format', () => {
  test('reads an older order file without migrating or rewriting it', async () => {
    const app = sandbox()
    app.role('engineer', '工程师')
    const ordersDir = join(app.dirs.projectDir, 'orders')
    mkdirSync(ordersDir, { recursive: true })
    // The shape a hand-written or older file may have: no `artifacts`, no
    // `updatedAt`, log entries without `by`. `parseOrder` normalizes on read.
    const legacy = [
      '{',
      '  "schemaVersion": 1,',
      '  "id": "wo-20261114-9",',
      '  "title": "老工单",',
      '  "stage": "review",',
      '  "size": "M",',
      '  "dri": "engineer",',
      '  "acceptance": ["能读出来"],',
      '  "log": [{ "at": "2026-11-14T08:00:00.000Z", "note": "老文件" }],',
      '  "createdAt": "2026-11-14T08:00:00.000Z"',
      '}',
      '',
    ].join('\n')
    const file = join(ordersDir, 'wo-20261114-9.json')
    writeFileSync(file, legacy, 'utf8')

    const state = await app.call('GET', '/state', { query: { session: 'sess-lead' } })
    expect(state.status).toBe(200)
    expect(state.json().orders.find((row) => row.id === 'wo-20261114-9')).toEqual(expect.objectContaining({
      title: '老工单',
      stage: 'review',
      size: 'M',
      driTitle: '工程师',
    }))

    const detail = await app.call('GET', '/order', { query: { session: 'sess-lead', id: 'wo-20261114-9' } })
    expect(detail.status).toBe(200)
    expect(detail.json().order.schemaVersion).toBe(1)
    expect(detail.json().order.artifacts).toEqual([])
    expect(detail.json().order.log[0].note).toBe('老文件')

    // Reading must not rewrite: `.dsh/org` stays the single source of truth.
    expect(readFileSync(file, 'utf8')).toBe(legacy)
  })
})
