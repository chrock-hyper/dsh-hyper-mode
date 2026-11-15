/**
 * The two model-facing tools of the company layer.
 *
 * They sit above `role_spawn` on purpose: spawning a subagent is hiring, and
 * hiring without an order is how a company ends up busy and unchanged. An order
 * is the thing a session can be handed, checked and signed.
 *
 * @module @chrock-studio/dsh-hyper-mode/hyper-org/tools
 */
import { boundRoleOf } from '../../hyper-roles/lib/binding.js'
import { readRole } from '../../hyper-roles/lib/store.js'

import { parseOrder } from './order-doc.js'
import { renderBoard, renderOrder, renderPulse } from './marker.js'
import { createOrder, listOrders, orgDirs, readOrder, saveOrder, signOrder } from './store.js'

/** Every result carries one model-facing text block. */
const TEXT_OUTPUT = {
  type: 'object',
  additionalProperties: false,
  properties: { text: { type: 'string', required: true } },
}

/**
 * Build the org tools for one mounted plugin instance.
 * @param options - context, config, scope resolver, binding handle and shipped helpers.
 * @returns the tool definitions to register.
 */
export function buildOrgTools(options) {
  const { config, roleDirsForAgent, binding, shipped } = options
  const { defineTool } = shipped

  /** @param agent - calling agent. @returns this caller's order directories. */
  const dirsOf = (agent) => orgDirs(roleDirsForAgent(agent))

  /**
   * The caller's role id, or `lead` for an unbound session.
   * @param agent - calling agent.
   * @returns a short identity label for logs.
   */
  const identityOf = (agent) => boundRoleOf(binding, agent) ?? 'lead'

  /**
   * Assert that a DRI names a role the company actually has.
   * @param dirs - role scope directories.
   * @param id - role id from the order.
   * @returns the role card.
   * @throws Error listing where to look instead.
   */
  const requireRole = (dirs, id) => {
    const card = readRole(dirs, id)
    if (card === undefined) {
      throw new Error(`岗位 "${id}" 不存在；先建岗位，或用 role action=list 看现有岗位，再指派 DRI`)
    }
    return card
  }

  const orderTool = defineTool({
    name: 'org_order',
    description:
      '管理一张工单——公司里唯一跨越会话的工作对象。建单（create）、读单（read）、改单（update）、'
      + '签收（sign）。阶段：intake 排队 → active 在制 → review 待验收 → done 已签收；撤单用 dropped 并写理由。'
      + '规则：done 只能由 sign 产生；M/L 规模的单没有验收标准不能进 active；在制满时新单会被压回 intake。',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['create', 'read', 'update', 'sign'],
        description: 'create 建单；read 读单；update 改阶段/领取人/验收标准/挂交付物；sign 签收或打回。',
      },
      id: { type: 'string', description: '工单 id（如 wo-20261115-1）；read/update/sign 必填。' },
      title: { type: 'string', description: '一句话说清这单要交付什么；create 必填。' },
      size: { type: 'string', enum: ['S', 'M', 'L'], description: '规模：S 单兵、M 三岗、L 全链路；默认 M。' },
      dri: { type: 'string', description: '领取人岗位 id（必须已存在）；留空表示未指派。' },
      acceptance: { type: 'string', description: '验收标准，一行一条（换行分隔，逗号不算分隔）；M/L 规模必填。' },
      artifacts: { type: 'string', description: '交付物路径，逗号分隔；update 时追加。' },
      stage: {
        type: 'string',
        enum: ['intake', 'active', 'review', 'blocked', 'dropped'],
        description: 'update 时的目标阶段；done 不在此列，只能由 sign 产生。',
      },
      note: { type: 'string', description: '写进工单日志的一句话；撤单与打回必须写理由。' },
      approve: { type: 'boolean', description: 'sign 时 true 签收、false 打回。' },
      scope: { type: 'string', enum: ['project', 'global'], description: 'create 写入哪个作用域；默认项目。' },
    },
    output: { schema: TEXT_OUTPUT, render: (_args, value) => [{ type: 'text', text: value.text }] },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const agent = exec.agent
      const dirs = dirsOf(agent)
      const roleDirs = roleDirsForAgent(agent)
      const action = String(args.action ?? '')
      const by = identityOf(agent)

      if (action === 'create') {
        const title = String(args.title ?? '').trim()
        if (title === '') throw new Error('create 需要 title：一句话说清要交付什么')
        if (typeof args.dri === 'string' && args.dri !== '') requireRole(roleDirs, args.dri)
        const created = createOrder(dirs, {
          scope: args.scope === 'global' || args.scope === 'project' ? args.scope : undefined,
          title,
          size: args.size,
          dri: typeof args.dri === 'string' && args.dri !== '' ? args.dri : undefined,
          acceptance: splitLines(args.acceptance),
          note: typeof args.note === 'string' ? args.note : undefined,
          by,
          wipLimit: config.wipLimit,
        })
        const lines = [
          `已建单 ${created.order.id} · ${created.order.title}（${created.order.stage}，${created.order.size}）`,
        ]
        if (created.reason === 'wip') {
          lines.push(`在制已满 ${created.wipLimit} 张，这单排队在 intake；先关单再 update 到 active。`)
        }
        if (created.reason === 'acceptance') {
          lines.push('这张单没有验收标准，M/L 规模不能直接进 active，已排队在 intake；补上 acceptance 再 update。')
        }
        if (created.order.acceptance.length === 0 && created.reason === undefined) {
          lines.push('还没有验收标准：将来进 review 前要补上，否则签不了字。')
        }
        return { text: lines.join('\n') }
      }

      if (action === 'read') {
        const found = requireOrderAt(dirs, args.id)
        const driTitle = found.order.dri === undefined ? undefined : readRole(roleDirs, found.order.dri)?.title
        return { text: renderOrder(found.order, { scope: found.scope, driTitle }) }
      }

      if (action === 'update') {
        const found = requireOrderAt(dirs, args.id)
        if (typeof args.dri === 'string' && args.dri !== '') requireRole(roleDirs, args.dri)
        const saved = saveOrder(dirs, {
          id: found.order.id,
          by,
          patch: {
            ...(args.stage === undefined ? {} : { stage: args.stage }),
            ...(args.title === undefined ? {} : { title: args.title }),
            ...(args.size === undefined ? {} : { size: args.size }),
            ...(args.dri === undefined ? {} : { dri: args.dri }),
            ...(args.acceptance === undefined ? {} : { acceptance: splitLines(args.acceptance) }),
            ...(args.artifacts === undefined ? {} : { artifacts: splitList(args.artifacts) }),
            ...(args.note === undefined ? {} : { note: args.note }),
          },
        })
        return { text: `已更新 ${saved.id}（${saved.stage}，${saved.size}）` }
      }

      if (action === 'sign') {
        const found = requireOrderAt(dirs, args.id)
        const callerRole = boundRoleOf(binding, agent)
        if (callerRole !== undefined && callerRole === found.order.dri) {
          throw new Error(`工单 ${found.order.id} 的领取人是 ${callerRole}：验收不能由领取人自己签`)
        }
        if (typeof args.note !== 'string' || args.note.trim() === '') {
          throw new Error('sign 需要 note：写清签收依据，或打回时要改哪一条')
        }
        const signed = signOrder(dirs, {
          id: found.order.id,
          approved: args.approve === true,
          by,
          note: args.note.trim(),
        })
        return { text: `${signed.id} ${args.approve === true ? '已签收 → done' : '已打回 → active'}（by ${by}）` }
      }

      throw new Error(`未知 action "${action}"；可用 create / read / update / sign`)
    },
  })

  const boardTool = defineTool({
    name: 'org_board',
    description:
      '看公司当前的工单盘面：在制多少、谁在做、卡在哪、超龄多久。派活前先看板，'
      + '避免同一时刻开太多单。status 是决策用的短摘要，list 是带全部字段的看板。',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['status', 'list'],
        description: 'status 短摘要；list 完整看板（含无法解析的文件）。',
      },
    },
    output: { schema: TEXT_OUTPUT, render: (_args, value) => [{ type: 'text', text: value.text }] },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const dirs = dirsOf(exec.agent)
      const summary = listOrders(dirs)
      const action = String(args.action ?? 'status')
      if (action === 'status') {
        return { text: renderPulse(summary, { wipLimit: config.wipLimit, rows: config.pulseRows }) || '当前没有在制工单。' }
      }
      return { text: renderBoard(summary, { wipLimit: config.wipLimit }) }
    },
  })

  return [orderTool, boardTool]

  /**
   * Read one order by id or fail with the board's vocabulary.
   * @param dirs - order directories.
   * @param id - raw id argument.
   * @returns the located order.
   */
  function requireOrderAt(dirs, id) {
    const text = String(id ?? '').trim()
    if (text === '') throw new Error('这个 action 需要 id')
    const found = readOrder(dirs, text)
    if (found === undefined) throw new Error(`工单 ${text} 不存在；用 org_board 的 action=list 查看现有工单`)
    return found
  }
}

/**
 * Split a newline-separated argument into items.
 *
 * Acceptance criteria are prose: "无构建、无网络，断网可玩" is ONE criterion,
 * so the Chinese comma must not split it. Only a line break starts a new one.
 * @param value - raw argument.
 * @returns trimmed, non-empty lines.
 */
export function splitLines(value) {
  if (typeof value !== 'string') return []
  return value
    .split(/\n/)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
}

/**
 * Split a comma- or newline-separated argument into items.
 * @param value - raw argument.
 * @returns trimmed, non-empty items.
 */
export function splitList(value) {
  if (typeof value !== 'string') return []
  return value
    .split(/[,，\n]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
}

/**
 * Parse an order file, exposed for tests that need the same rules.
 * @param text - file contents.
 * @returns the normalized order.
 */
export function readOrderText(text) {
  return parseOrder(text)
}
