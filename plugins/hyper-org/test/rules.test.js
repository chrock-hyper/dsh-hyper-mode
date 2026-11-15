/**
 * The shared rules: parsing, the four sign-off blockers, the DRI check, the
 * explanation of a downgraded create, the error mapping, and the three
 * "validate then store" sequences both writers call.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createRole, readRole } from '../../hyper-roles/lib/store.js'
import { orgDirs } from '../lib/store.js'
import {
  classify,
  createWithRules,
  explainCreate,
  requireRoleId,
  signBlockers,
  signWithRules,
  splitLines,
  splitList,
  updateWithRules,
} from '../lib/rules.js'

const roots = []

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true })
})

/**
 * A fresh project with a role directory and two roles.
 * @returns the sandbox helpers.
 */
function sandbox() {
  const root = mkdtempSync(join(tmpdir(), 'hyper-org-rules-'))
  roots.push(root)
  const home = join(root, 'home')
  const projectRoot = join(root, 'project')
  mkdirSync(projectRoot, { recursive: true })
  const roleDirs = {
    home,
    globalDir: join(home, 'roles'),
    projectRoot,
    projectDir: join(projectRoot, '.dsh', 'roles'),
  }
  const dirs = orgDirs(roleDirs)
  createRole(roleDirs, { scope: 'project', id: 'engineer', title: '工程师', body: '## 职责\n实现。' })
  createRole(roleDirs, { scope: 'global', id: 'reviewer', title: '验收评审员', body: '' })
  return {
    dirs,
    lookupRole: (id) => readRole(roleDirs, id),
    /** @param input - create overrides; `wipLimit` sets the slot budget. @returns the created record. */
    create(input = {}) {
      const { wipLimit = 99, ...rest } = input
      return createWithRules(dirs, { title: '一张单', size: 'S', by: 'lead', ...rest }, {
        lookupRole: (id) => readRole(roleDirs, id),
        wipLimit,
      })
    },
    /** @param created - a create result. @param extra - patch additions. */
    patch(created, patch = {}, by = 'lead') {
      return updateWithRules(dirs, { id: created.order.id, by, patch }, {
        lookupRole: (id) => readRole(roleDirs, id),
      })
    },
    /** @param created - a create result. @param extra - sign additions. */
    sign(created, input = {}) {
      return signWithRules(dirs, { id: created.order.id, approve: true, note: '验收通过', by: 'lead', ...input })
    },
  }
}

/** @returns one order-shaped object for the pure blocker checks. */
function orderOf(overrides = {}) {
  return {
    id: 'wo-20261115-1',
    stage: 'review',
    size: 'S',
    dri: 'engineer',
    acceptance: ['可判定'],
    ...overrides,
  }
}

describe('text parsing', () => {
  test('only a line break starts a new acceptance criterion', () => {
    expect(splitLines('纯静态，无网络请求，断网可玩\nCanvas 绘制，适配 DPR')).toEqual([
      '纯静态，无网络请求，断网可玩',
      'Canvas 绘制，适配 DPR',
    ])
    expect(splitLines('')).toEqual([])
    expect(splitLines(undefined)).toEqual([])
  })

  test('artifact lists split on ASCII and full-width commas', () => {
    expect(splitList('a.txt, b.txt，c.txt\nd.txt')).toEqual(['a.txt', 'b.txt', 'c.txt', 'd.txt'])
  })
})

describe('signBlockers', () => {
  test('a non-review order cannot be signed', () => {
    const blockers = signBlockers(orderOf({ stage: 'active' }), { role: undefined, note: 'ok', approve: true })
    expect(blockers.map((entry) => entry.code)).toEqual(['not_review'])
    expect(blockers[0].message).toBe('工单 wo-20261115-1 现在是 active，只有 review 状态可以签收；先 update 到 review')
  })

  test('the DRI cannot sign its own order', () => {
    const blockers = signBlockers(orderOf({ dri: 'engineer' }), { role: 'engineer', note: '自查通过', approve: true })
    expect(blockers.map((entry) => entry.code)).toEqual(['self_sign'])
    expect(blockers[0].message).toBe('工单 wo-20261115-1 的领取人是 engineer：验收不能由领取人自己签')
  })

  test('a blank note is refused, an absent one is "not asked yet"', () => {
    expect(signBlockers(orderOf(), { role: undefined, note: '', approve: true }).map((entry) => entry.code))
      .toEqual(['note_required'])
    expect(signBlockers(orderOf(), { role: undefined, note: '   ', approve: true }).map((entry) => entry.code))
      .toEqual(['note_required'])
    expect(signBlockers(orderOf(), { role: undefined, approve: true }).map((entry) => entry.code))
      .toEqual([])
  })

  test('signing off needs acceptance criteria; sending back does not', () => {
    const empty = orderOf({ acceptance: [] })
    expect(signBlockers(empty, { role: undefined, note: 'ok', approve: true }).map((entry) => entry.code))
      .toEqual(['no_acceptance'])
    expect(signBlockers(empty, { role: undefined, note: '补一下', approve: false }).map((entry) => entry.code))
      .toEqual([])
  })

  test('every applicable blocker is returned, in a stable order', () => {
    const blockers = signBlockers(orderOf({ stage: 'active', dri: 'engineer', acceptance: [] }), {
      role: 'engineer',
      note: '',
      approve: true,
    })
    expect(blockers.map((entry) => entry.code)).toEqual(['self_sign', 'note_required', 'not_review', 'no_acceptance'])
  })

  test('an unbound caller is not a DRI even when the log label says lead', () => {
    // The false positive the store-level check would have created: an order
    // whose `dri` was hand-edited to "lead" must still be signable by the lead.
    expect(signBlockers(orderOf({ dri: 'lead' }), { role: undefined, note: 'ok', approve: true })).toEqual([])
    expect(signBlockers(orderOf({ dri: 'lead' }), { role: 'lead', note: 'ok', approve: true })
      .map((entry) => entry.code)).toEqual(['self_sign'])
  })
})

describe('requireRoleId', () => {
  test('returns the card when the role exists and names the id when it does not', () => {
    const app = sandbox()
    expect(requireRoleId(app.lookupRole, 'engineer').fields.title).toBe('工程师')
    expect(() => requireRoleId(app.lookupRole, 'ghost')).toThrow(/岗位 "ghost" 不存在/)
  })
})

describe('explainCreate', () => {
  test('explains each downgrade in the caller’s language', () => {
    const order = orderOf({ stage: 'intake', acceptance: ['可判定'] })
    expect(explainCreate({ order, reason: 'wip', downgraded: true, wipLimit: 2 }))
      .toEqual(['在制已满 2 张，这单排队在 intake；先关单再 update 到 active。'])
    expect(explainCreate({ order, reason: 'acceptance', downgraded: true, wipLimit: 2 }))
      .toEqual(['这张单没有验收标准，M/L 规模不能直接进 active，已排队在 intake；补上 acceptance 再 update。'])
  })

  test('warns about missing criteria when the create succeeded anyway', () => {
    const empty = orderOf({ stage: 'active', acceptance: [] })
    expect(explainCreate({ order: empty, downgraded: false }))
      .toEqual(['还没有验收标准：将来进 review 前要补上，否则签不了字。'])
    expect(explainCreate({ order: orderOf({ stage: 'active', acceptance: ['可判定'] }), downgraded: false }))
      .toEqual([])
  })
})

describe('classify', () => {
  const cases = [
    ['工单 wo-1 不能直接置为 done：先置 review，再由非领取人用 sign 签收', 409, 'done_forbidden'],
    ['撤单要写理由：给 note', 400, 'note_required'],
    ['工单 wo-1 是 M 规模，没有验收标准不能进 active：先补 acceptance', 409, 'acceptance_gate'],
    ['工单 wo-1 现在是 active，只有 review 状态可以签收；先 update 到 review', 409, 'not_review'],
    ['工单 wo-1 没有验收标准，签字等于自欺：先 update 补上 acceptance', 409, 'no_acceptance'],
    ['工单 wo-9 不存在；用 org_board 的 action=list 查看现有工单', 404, 'order_not_found'],
    ['工单 wo-1 的领取人是 engineer：验收不能由领取人自己签', 403, 'self_sign'],
    ['sign 需要 note：写清签收依据，或打回时要改哪一条', 400, 'note_required'],
    ['岗位 "ghost" 不存在；先建岗位，或用 role action=list 看现有岗位，再指派 DRI', 400, 'unknown_role'],
    ['这个会话没有项目根，只能写全局作用域', 400, 'no_project'],
    ['create 需要 title：一句话说清要交付什么', 400, 'bad_title'],
    ['work order wo-1 has unknown size "XL"', 400, 'bad_size'],
    ['work order wo-1 has unknown stage "doing"', 400, 'bad_stage'],
    ['invalid work order id "../x"', 400, 'bad_id'],
    ['work order wo-1 at /tmp/x cannot be read: Unexpected token', 500, 'order_unreadable'],
  ]

  test('every gate message maps to its documented status and code', () => {
    for (const [text, status, code] of cases) {
      expect(classify(new Error(text))).toEqual({ status, code })
    }
  })

  test('falls back to 400 unknown instead of guessing', () => {
    expect(classify(new Error('something entirely new'))).toEqual({ status: 400, code: 'unknown' })
  })
})

describe('createWithRules', () => {
  test('refuses a missing title', () => {
    const app = sandbox()
    expect(() => app.create({ title: '   ' })).toThrow(/create 需要 title/)
  })

  test('refuses to run without a slot budget', () => {
    const app = sandbox()
    expect(() => createWithRules(app.dirs, { title: '没有上限', size: 'S' }, { lookupRole: app.lookupRole }))
      .toThrow(/wipLimit/)
  })

  test('queues new work when the slots are taken', () => {
    const app = sandbox()
    const first = app.create({ size: 'M', acceptance: ['可判定'], wipLimit: 1 })
    const second = app.create({ title: '第二单', size: 'S', wipLimit: 1 })
    expect(first.order.stage).toBe('active')
    expect(second.downgraded).toBe(true)
    expect(second.reason).toBe('wip')
    expect(second.order.stage).toBe('intake')
  })

  test('queues medium work without acceptance criteria, but not small work', () => {
    const app = sandbox()
    const medium = app.create({ size: 'M' })
    const small = app.create({ title: '小修', size: 'S' })
    expect(medium.reason).toBe('acceptance')
    expect(medium.order.stage).toBe('intake')
    expect(small.downgraded).toBe(false)
    expect(small.order.stage).toBe('active')
  })

  test('refuses an unknown DRI', () => {
    const app = sandbox()
    expect(() => app.create({ dri: 'ghost' })).toThrow(/岗位 "ghost" 不存在/)
  })

  test('keeps a comma-heavy criterion intact', () => {
    const app = sandbox()
    const created = app.create({ size: 'S', acceptance: '纯静态，无网络请求，断网可玩\nCanvas 绘制' })
    expect(created.order.acceptance).toEqual(['纯静态，无网络请求，断网可玩', 'Canvas 绘制'])
  })
})

describe('updateWithRules', () => {
  test('splits criteria by line and artifacts by comma, appending artifacts', () => {
    const app = sandbox()
    const created = app.create({ size: 'S' })
    const saved = app.patch(created, {
      acceptance: '一，二\n三',
      artifacts: 'a.txt, b.txt',
      note: '补标准',
    })
    expect(saved.acceptance).toEqual(['一，二', '三'])
    expect(saved.artifacts).toEqual(['a.txt', 'b.txt'])
    expect(saved.log.at(-1).note).toBe('updated: 补标准')
    const again = app.patch(created, { artifacts: 'b.txt，c.txt' })
    expect(again.artifacts).toEqual(['a.txt', 'b.txt', 'c.txt'])
  })

  test('refuses a promotion the acceptance gate blocks', () => {
    const app = sandbox()
    const created = app.create({ size: 'M' })
    expect(() => app.patch(created, { stage: 'active' })).toThrow(/没有验收标准/)
  })

  test('refuses an unknown DRI and a missing order', () => {
    const app = sandbox()
    const created = app.create({ size: 'S' })
    expect(() => app.patch(created, { dri: 'ghost' })).toThrow(/岗位 "ghost" 不存在/)
    expect(() => updateWithRules(app.dirs, { id: 'wo-20261115-999' }, { lookupRole: app.lookupRole }))
      .toThrow(/不存在/)
  })
})

describe('signWithRules', () => {
  test('demands a note even when the caller omits the field', () => {
    const app = sandbox()
    const created = app.create({ size: 'S' })
    app.patch(created, { stage: 'review' })
    expect(() => signWithRules(app.dirs, { id: created.order.id, approve: true, by: 'lead' }))
      .toThrow(/sign 需要 note/)
    expect(() => signWithRules(app.dirs, { id: created.order.id, approve: true, note: '  ', by: 'lead' }))
      .toThrow(/sign 需要 note/)
  })

  test('a real bound role cannot sign its own order', () => {
    const app = sandbox()
    const created = app.create({ size: 'S', dri: 'engineer' })
    app.patch(created, { stage: 'review' })
    expect(() => app.sign(created, { role: 'engineer', by: 'engineer' }))
      .toThrow(/验收不能由领取人自己签/)
  })

  test('an unbound caller is unaffected when the DRI is someone else', () => {
    const app = sandbox()
    const created = app.create({ size: 'S', acceptance: ['可判定'], dri: 'engineer' })
    app.patch(created, { stage: 'review' })
    const signed = app.sign(created, { role: undefined, by: 'lead' })
    expect(signed.stage).toBe('done')
    expect(signed.log.at(-1).by).toBe('lead')
  })

  test('refuses a non-review order, an unsigned criteria set and a direct done', () => {
    const app = sandbox()
    const active = app.create({ size: 'S' })
    expect(() => app.sign(active)).toThrow(/只有 review 状态可以签收/)
    expect(() => app.patch(active, { stage: 'done' })).toThrow(/不能直接置为 done/)
    const empty = app.create({ size: 'S', acceptance: [] })
    app.patch(empty, { stage: 'review' })
    expect(() => app.sign(empty)).toThrow(/没有验收标准/)
  })

  test('records the signer, the note and the new stage', () => {
    const app = sandbox()
    const created = app.create({ size: 'S', acceptance: ['可判定'] })
    app.patch(created, { stage: 'review' })
    const signed = app.sign(created, { role: 'reviewer', by: 'reviewer', note: '复跑通过' })
    expect(signed.stage).toBe('done')
    expect(signed.log.at(-1)).toEqual(expect.objectContaining({ by: 'reviewer' }))
    expect(signed.log.at(-1).note).toContain('复跑通过')
  })

  test('sending back returns the order to active', () => {
    const app = sandbox()
    const created = app.create({ size: 'S' })
    app.patch(created, { stage: 'review' })
    const back = app.sign(created, { approve: false, note: '日志没写结论' })
    expect(back.stage).toBe('active')
  })
})
