/**
 * The `role_spawn` tool: delegate a subagent that carries one role card in its
 * task preamble and is bound to that role for the rest of its session.
 *
 * @module @chrock-studio/dsh-hyper-roles/tools/role-spawn
 */
import type { SubagentsService } from '@chrock-studio/dsh-hyper-shared/host'

import { bindLine, renderBrief } from '../marker.ts'
import { readGuide, readRole } from '../store.ts'
import type { ToolContext, ToolDefinition } from './context.ts'
import { modelOptions } from './model-options.ts'

/** The `role_spawn` result: the model-facing text plus the UI presentation fields. */
export interface ActivationResult {
  text: string
  kind: 'activation'
  name: string
  role: string
}

/**
 * The shipped subagents service.
 *
 * The shared Host view marks these members optional and `startActivation`'s
 * result opaque; this tool calls them unconditionally and reads the started
 * agent's name, so the members it needs are declared present here.
 */
interface SubagentSpawner extends SubagentsService {
  getProvider(name?: string): unknown
  resolveMaxDepth(input?: unknown): unknown
  startActivation(spec: unknown): Promise<{ name: string }>
}

/**
 * Build the `role_spawn` tool definition.
 * @param rt - the shared tool context.
 * @returns the tool definition.
 */
export function createRoleSpawnTool(rt: ToolContext): ToolDefinition<ActivationResult> {
  const { ctx, config, defineTool, dirsOf, recentNotes } = rt

  return defineTool<ActivationResult>({
    name: 'role_spawn',
    description:
      '按岗位委派一个子代理：子代理的任务开头会带上该岗位卡片，并在会话里绑定这个岗位，'
      + '之后它自己的每一步都能读到岗位约定。用于把工作交给一个明确的角色，而不是一个泛泛的子代理。',
    parameters: {
      role: { type: 'string', required: true, description: '岗位 id，取自岗位目录。' },
      description: {
        type: 'string',
        required: true,
        description: "这次委派的简短描述（3-5 个词），用于界面展示，使用用户当前请求的语言。",
      },
      prompt: {
        type: 'string',
        required: true,
        description: '完整的自包含任务说明。它看不到你当前的对话，岗位卡片由工具自动附加，不要重复岗位职责。',
      },
      name: {
        type: 'string',
        description: '子代理名字，唯一于你创建的子代理：小写字母、数字与连字符，不超过 32 字符；省略则自动编号。',
      },
      cwd: {
        type: 'string',
        description: '子代理的初始工作目录；省略则继承调用者。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string', required: true },
          kind: { type: 'string', required: true, const: 'activation' },
          name: { type: 'string', required: true },
          role: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.text }],
      presentationMeta: (_args, value) => ({ kind: value.kind, name: value.name }),
    },
    isConcurrencySafe: () => true,
    async execute(args, exec): Promise<ActivationResult> {
      const parent = exec.agent
      if (parent === undefined) throw new Error('role_spawn 需要调用它的 agent')
      const subagents = ctx.get('subagents') as SubagentSpawner | undefined
      if (subagents === undefined) throw new Error('这个组合里没有 subagents 服务，无法委派')
      const dirs = dirsOf(parent)
      const id = String(args.role ?? '').trim()
      const card = readRole(dirs, id)
      if (card === undefined) throw new Error(`岗位 "${id}" 不存在；用 role action=list 查看可用岗位`)
      const provider = config.provider
      if (subagents.getProvider(provider) === undefined) {
        throw new Error(`子代理 provider "${provider}" 未载入，无法委派`)
      }
      const guide = readGuide(dirs, id)
      const agentOptions = modelOptions(card.fields.model)
      const preamble = [
        bindLine(id),
        renderBrief(card, {
          notes: recentNotes(dirs, id),
          guide: guide.text,
          maxChars: config.briefMaxChars,
        }),
      ].join('\n')
      const maxDepth = subagents.resolveMaxDepth(undefined)
      const started = await subagents.startActivation({
        provider,
        label: String(args.description),
        ...(agentOptions === undefined ? {} : { agentOptions }),
        ...(typeof args.name === 'string' && args.name !== '' ? { name: args.name } : {}),
        ...(typeof args.cwd === 'string' && args.cwd !== '' ? { cwd: args.cwd } : {}),
        prompt: [{ type: 'text', text: `${preamble}${String(args.prompt)}` }],
        parent,
        ...(maxDepth === undefined ? {} : { maxDepth }),
        signal: exec.signal,
        delivery: 'parent',
      })
      const routed = agentOptions === undefined ? '' : `（model ${card.fields.model}）`
      return {
        text: `started subagent ${started.name} in role ${id}${routed}`,
        kind: 'activation',
        name: started.name,
        role: id,
      }
    },
  })
}
