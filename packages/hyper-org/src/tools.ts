/**
 * The two model-facing tools of the company layer.
 *
 * They sit above `role_spawn` on purpose: spawning a subagent is hiring, and
 * hiring without an order is how a company ends up busy and unchanged. An order
 * is the thing a session can be handed, checked and signed.
 *
 * @module @chrock-hyper/dsh-hyper-org/tools
 */
import type { AgentHandle, HostContext } from '@chrock-hyper/dsh-hyper-shared/host'
import { boundRoleOf, readRole } from '@chrock-hyper/dsh-hyper-roles/internal'

import type { OrgConfig } from './config.ts'
import type { WorkOrder } from './order-doc.ts'
import { parseOrder } from './order-doc.ts'
import { renderBoard, renderOrder, renderPulse } from './marker.ts'
import { createWithRules, explainCreate, signWithRules, updateWithRules } from './rules.ts'
import type { OrgDirs, ScopeDirs } from './store.ts'
import { listOrders, orgDirs, readOrder } from './store.ts'

/** Every result carries one model-facing text block; structured fields are for the UI. */
const TEXT_OUTPUT = {
  type: 'object',
  additionalProperties: false,
  properties: { text: { type: 'string', required: true } },
}

/** The argument bag a tool receives; the runtime validates it against `parameters`. */
export type ToolArgs = Record<string, unknown>

/** The per-call handle the runtime passes to `execute`. */
export interface ToolExecution {
  agent?: AgentHandle
  signal?: unknown
}

/** One declared tool parameter, as the schema block spells it. */
export interface ToolParameter {
  type: string
  description?: string
  required?: boolean
  enum?: readonly string[]
  const?: string
  additionalProperties?: boolean
}

/** The output contract of one tool: a runtime schema plus the render hooks. */
export interface ToolOutput<R> {
  schema: unknown
  render?: (args: ToolArgs, value: R) => unknown
  presentationMeta?: (args: ToolArgs, value: R) => unknown
}

/** One tool definition, before and after the shipped `defineTool` call. */
export interface ToolDefinition<R> {
  name: string
  description: string
  parameters?: Record<string, ToolParameter>
  output?: ToolOutput<R>
  isConcurrencySafe?: () => boolean
  execute(args: ToolArgs, execution: ToolExecution): R | Promise<R>
}

/** The shipped `@deepseek-ai/dsh-tools` helper this plugin uses. */
export type DefineTool = <R>(definition: ToolDefinition<R>) => ToolDefinition<R>

/**
 * The shipped tools module.
 *
 * Only `defineTool` is read here, and it is used as a parts bin: the definition
 * it returns is exactly the object handed in.
 */
export interface ShippedToolsModule {
  defineTool: DefineTool
}

/** The result of a text-only tool. */
export interface ToolTextResult {
  text: string
}

/**
 * The role binding projection, named through the seam's own signature.
 *
 * `hyper-roles/internal` exports `registerBinding` and `boundRoleOf` but not the
 * handle type, so the type is taken from the function this package passes the
 * handle to — the two stay identical by construction.
 */
export type BindingHandle = Parameters<typeof boundRoleOf>[0]

/** Everything `buildOrgTools` needs from one mounted plugin instance. */
export interface BuildOrgToolsOptions {
  ctx?: HostContext
  config: OrgConfig
  roleDirsForAgent(agent: AgentHandle | undefined): ScopeDirs
  binding: BindingHandle
  shipped: ShippedToolsModule
}

/**
 * Build the org tools for one mounted plugin instance.
 * @param options - context, config, scope resolver, binding handle and shipped helpers.
 * @returns the tool definitions to register.
 */
export function buildOrgTools(options: BuildOrgToolsOptions): Array<ToolDefinition<ToolTextResult>> {
  const { config, roleDirsForAgent, binding, shipped } = options
  const { defineTool } = shipped

  /** @param agent - calling agent. @returns this caller's order directories. */
  const dirsOf = (agent: AgentHandle | undefined): OrgDirs => orgDirs(roleDirsForAgent(agent))

  /**
   * The caller's role id, or `lead` for an unbound session.
   * @param agent - calling agent.
   * @returns a short identity label for logs.
   */
  const identityOf = (agent: AgentHandle | undefined): string => boundRoleOf(binding, agent) ?? 'lead'

  const orderTool = defineTool<ToolTextResult>({
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
        const created = createWithRules(dirs, {
          scope: args.scope === 'global' || args.scope === 'project' ? args.scope : undefined,
          title: args.title,
          size: args.size,
          dri: args.dri,
          acceptance: args.acceptance,
          note: args.note,
          by,
        }, { lookupRole: (id) => readRole(roleDirs, id), wipLimit: config.wipLimit })
        const lines = [
          `已建单 ${created.order.id} · ${created.order.title}（${created.order.stage}，${created.order.size}）`,
          ...explainCreate(created),
        ]
        return { text: lines.join('\n') }
      }

      if (action === 'read') {
        const found = requireOrderAt(dirs, args.id)
        // A role card keeps its title under `fields`. This line used to read a
        // root-level `title`, which no card has, so the tool's read card never
        // showed the DRI's title while the panel did — the same role rendered
        // differently depending on who asked.
        const dri = found.order.dri
        const card = dri === undefined ? undefined : readRole(roleDirs, dri)
        return { text: renderOrder(found.order, { scope: found.scope, driTitle: card?.fields.title }) }
      }

      if (action === 'update') {
        const found = requireOrderAt(dirs, args.id)
        const saved = updateWithRules(dirs, {
          id: found.order.id,
          by,
          patch: {
            ...(args.stage === undefined ? {} : { stage: args.stage }),
            ...(args.title === undefined ? {} : { title: args.title }),
            ...(args.size === undefined ? {} : { size: args.size }),
            ...(args.dri === undefined ? {} : { dri: args.dri }),
            ...(args.acceptance === undefined ? {} : { acceptance: args.acceptance }),
            ...(args.artifacts === undefined ? {} : { artifacts: args.artifacts }),
            ...(args.note === undefined ? {} : { note: args.note }),
          },
        }, { lookupRole: (id) => readRole(roleDirs, id) })
        return { text: `已更新 ${saved.id}（${saved.stage}，${saved.size}）` }
      }

      if (action === 'sign') {
        const found = requireOrderAt(dirs, args.id)
        const signed = signWithRules(dirs, {
          id: found.order.id,
          approve: args.approve,
          // The tool's sign always asks for a note, so a missing argument is an
          // empty one: `undefined` means "nobody asked yet" to the rules.
          note: args.note ?? '',
          // `by` is the log label; only a real binding can be the order's own
          // DRI, so an unbound caller never trips the self-sign check.
          by,
          role: boundRoleOf(binding, agent),
        })
        return { text: `${signed.id} ${args.approve === true ? '已签收 → done' : '已打回 → active'}（by ${by}）` }
      }

      throw new Error(`未知 action "${action}"；可用 create / read / update / sign`)
    },
  })

  const boardTool = defineTool<ToolTextResult>({
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
  function requireOrderAt(dirs: OrgDirs, id: unknown) {
    const text = String(id ?? '').trim()
    if (text === '') throw new Error('这个 action 需要 id')
    const found = readOrder(dirs, text)
    if (found === undefined) throw new Error(`工单 ${text} 不存在；用 org_board 的 action=list 查看现有工单`)
    return found
  }
}

/**
 * Parsers shared with the panel, re-exported at their historical path.
 *
 * `test/org-flow.test.js` imports `splitLines` from here, and the panel needs
 * the same "only a line break separates criteria" rule; the definition lives in
 * `rules.ts` so there is one copy.
 */
export { splitLines, splitList } from './rules.ts'

/**
 * Parse an order file, exposed for tests that need the same rules.
 * @param text - file contents.
 * @returns the normalized order.
 */
export function readOrderText(text: string): WorkOrder {
  return parseOrder(text)
}
