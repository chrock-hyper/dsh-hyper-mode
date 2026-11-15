/**
 * The company workflow: the slot budget, the acceptance gate, the sign-off
 * rules, and the two tools that expose them.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createRole } from '../../hyper-roles/lib/store.js'
import { orgDirs, createOrder, listOrders, saveOrder, signOrder } from '../lib/store.js'
import { buildOrgTools } from '../lib/tools.js'

const root = mkdtempSync(join(tmpdir(), 'hyper-org-'))
const home = join(root, 'home')
const projectRoot = join(root, 'project')
const roleDirs = {
  home,
  globalDir: join(home, 'roles'),
  projectRoot,
  projectDir: join(projectRoot, '.dsh', 'roles'),
}
const dirs = orgDirs(roleDirs)

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

/** @param id - role id. @param title - display title. */
function ensureRole(id, title) {
  createRole(roleDirs, { scope: 'project', id, title, body: `## 职责\n${title}。` })
}

const CONFIG = { wipLimit: 2, pulseRows: 3, boardSection: true }
const lead = { session: { id: 'lead-session' } }
const engineer = { session: { id: 'engineer-session' } }
const binding = { stateOf: (session) => (session?.id === 'engineer-session' ? { role: 'engineer' } : null) }

/** @returns the two tool definitions bound to a fake host. */
function toolsFor() {
  const definitions = buildOrgTools({
    config: CONFIG,
    roleDirsForAgent: () => roleDirs,
    binding,
    shipped: { defineTool: (options) => options },
  })
  return Object.fromEntries(definitions.map((definition) => [definition.name, definition]))
}

const execAs = (agent) => ({ agent, signal: new AbortController().signal })
const textOf = (value) => value.text

describe('slot budget', () => {
  test('work beyond the limit lands in intake instead of starting', () => {
    const first = createOrder(dirs, { title: '第一单', acceptance: ['可判定'], by: 'lead', wipLimit: 2 })
    const second = createOrder(dirs, { title: '第二单', acceptance: ['可判定'], by: 'lead', wipLimit: 2 })
    const third = createOrder(dirs, { title: '第三单', acceptance: ['可判定'], by: 'lead', wipLimit: 2 })
    expect(first.order.stage).toBe('active')
    expect(second.order.stage).toBe('active')
    expect(third.order.stage).toBe('intake')
    expect(third.reason).toBe('wip')
    expect(listOrders(dirs).merged).toHaveLength(3)
  })

  test('ids are per-day and never reuse a taken number', () => {
    const created = createOrder(dirs, { title: '第四单', acceptance: ['可判定'], by: 'lead', wipLimit: 2 })
    const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '')
    expect(created.order.id).toMatch(new RegExp(`^wo-${stamp}-\\d+$`))
    expect(listOrders(dirs).merged.map((order) => order.id)).toContain(created.order.id)
  })
})

describe('acceptance gate', () => {
  test('medium work without acceptance criteria queues in intake', () => {
    const created = createOrder(dirs, { title: '没有标准的单', size: 'M', by: 'lead', wipLimit: 99 })
    expect(created.order.stage).toBe('intake')
    expect(created.reason).toBe('acceptance')
  })

  test('small work may start without them', () => {
    const created = createOrder(dirs, { title: '小修', size: 'S', by: 'lead', wipLimit: 99 })
    expect(created.order.stage).toBe('active')
  })

  test('promoting to active refuses while the criteria are missing', () => {
    const created = createOrder(dirs, { title: '待补标准', size: 'M', by: 'lead', wipLimit: 99 })
    expect(() => saveOrder(dirs, { id: created.order.id, by: 'lead', patch: { stage: 'active' } }))
      .toThrow(/没有验收标准/)
  })
})

describe('sign-off', () => {
  test('done cannot be written directly', () => {
    const created = createOrder(dirs, { title: '直接关单', size: 'S', by: 'lead', wipLimit: 99 })
    expect(() => saveOrder(dirs, { id: created.order.id, by: 'lead', patch: { stage: 'done' } }))
      .toThrow(/不能直接置为 done/)
  })

  test('signing requires review, then closes the order', () => {
    const created = createOrder(dirs, { title: '待验收', acceptance: ['跑通'], by: 'lead', wipLimit: 99 })
    expect(() => signOrder(dirs, { id: created.order.id, approved: true, by: 'lead', note: '看着不错' }))
      .toThrow(/只有 review 状态/)
    saveOrder(dirs, { id: created.order.id, by: 'lead', patch: { stage: 'review' } })
    const signed = signOrder(dirs, { id: created.order.id, approved: true, by: 'lead', note: '验收标准满足' })
    expect(signed.stage).toBe('done')
  })

  test('sending back returns the order to active with the reason on record', () => {
    const created = createOrder(dirs, { title: '被打回', acceptance: ['跑通'], by: 'lead', wipLimit: 99 })
    saveOrder(dirs, { id: created.order.id, by: 'lead', patch: { stage: 'review' } })
    const back = signOrder(dirs, { id: created.order.id, approved: false, by: 'lead', note: '日志没有写结论' })
    expect(back.stage).toBe('active')
    expect(back.log.at(-1).note).toContain('日志没有写结论')
  })
})

describe('org_order tool', () => {
  test('refuses a DRI that is not a role', async () => {
    const tools = toolsFor()
    await expect(tools.org_order.execute({
      action: 'create',
      title: '指派幽灵',
      dri: 'ghost',
    }, execAs(lead))).rejects.toThrow(/岗位 "ghost" 不存在/)
  })

  test('a role holding the order cannot sign it off itself', async () => {
    ensureRole('engineer', '工程师')
    const tools = toolsFor()
    const created = await tools.org_order.execute({
      action: 'create',
      title: '工程师自己签字',
      acceptance: '跑通',
      dri: 'engineer',
      size: 'S',
    }, execAs(lead))
    const id = /wo-\d{8}-\d+/.exec(textOf(created))[0]
    await tools.org_order.execute({ action: 'update', id, stage: 'review' }, execAs(lead))
    await expect(tools.org_order.execute({ action: 'sign', id, approve: true, note: '自查通过' }, execAs(engineer)))
      .rejects.toThrow(/验收不能由领取人自己签/)
    const signed = await tools.org_order.execute({ action: 'sign', id, approve: true, note: '我复核过' }, execAs(lead))
    expect(textOf(signed)).toContain('已签收')
  })

  test('sign demands a note', async () => {
    const tools = toolsFor()
    const created = await tools.org_order.execute({
      action: 'create',
      title: '无理由签收',
      acceptance: '跑通',
      size: 'S',
    }, execAs(lead))
    const id = /wo-\d{8}-\d+/.exec(textOf(created))[0]
    await tools.org_order.execute({ action: 'update', id, stage: 'review' }, execAs(lead))
    await expect(tools.org_order.execute({ action: 'sign', id, approve: true }, execAs(lead)))
      .rejects.toThrow(/需要 note/)
  })
})

describe('org_board tool', () => {
  test('reports the board and stays readable when empty', async () => {
    const tools = toolsFor()
    const status = await tools.org_board.execute({ action: 'status' }, execAs(lead))
    expect(textOf(status).length).toBeGreaterThan(0)
    const list = await tools.org_board.execute({ action: 'list' }, execAs(lead))
    expect(textOf(list)).toContain('工单看板')
  })
})
