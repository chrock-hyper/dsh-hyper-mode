/**
 * Shared per-instance plumbing for the role tools.
 *
 * `buildRoleTools` receives one mounted plugin instance worth of context
 * (services, config, scope resolver, binding projection). This module folds
 * that into a small context object plus the caller-identity helpers every tool
 * handler needs, so each handler module stays about its own action.
 *
 * @module @chrock-studio/dsh-hyper-roles/tools/context
 */
import type { AgentHandle, HostContext } from '@chrock-studio/dsh-hyper-shared/host'

import type { RoleProjectionHandle } from '../binding.ts'
import { boundRoleOf } from '../binding.ts'
import type { ResolvedDirs, RoleConfig } from '../scopes.ts'
import { readNotes, readRole } from '../store.ts'
import type { RoleCard } from '../store/cards.ts'
import type { NoteEntry } from '../store/text.ts'

/** Every result carries one model-facing text block; structured fields are for the UI. */
export const TEXT_OUTPUT = {
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

/** Everything `buildRoleTools` needs from one mounted plugin instance. */
export interface ToolRuntimeOptions {
  ctx: HostContext
  config: RoleConfig
  packageRoot: string
  dirsForAgent(agent: AgentHandle | undefined): ResolvedDirs
  binding: RoleProjectionHandle | undefined
  shipped: ShippedToolsModule
}

/** The context every tool handler closes over. */
export interface ToolContext {
  ctx: HostContext
  config: RoleConfig
  packageRoot: string
  defineTool: DefineTool
  dirsOf(agent: AgentHandle | undefined): ResolvedDirs
  selfCardOf(dirs: ResolvedDirs, agent: AgentHandle | undefined): RoleCard | undefined
  recentNotes(dirs: ResolvedDirs, id: string): NoteEntry[]
  assertCanEdit(card: RoleCard | undefined): void
  assertCanTeach(self: RoleCard | undefined, targetId: string): void
  callerLabel(agent: AgentHandle | undefined): string
}

/**
 * Build the context shared by the tool handlers.
 * @param options - context, configuration, scope resolver, projection handle and shipped helpers.
 * @returns the context every handler closes over.
 */
export function createToolContext(options: ToolRuntimeOptions): ToolContext {
  const { ctx, config, packageRoot, dirsForAgent, binding, shipped } = options
  const { defineTool } = shipped

  /** @param agent - calling agent. @returns its scope directories. */
  const dirsOf = (agent: AgentHandle | undefined): ResolvedDirs => dirsForAgent(agent)

  /** @param dirs - scope directories. @param agent - caller. @returns the caller's own card, if bound. */
  const selfCardOf = (dirs: ResolvedDirs, agent: AgentHandle | undefined): RoleCard | undefined => {
    const id = boundRoleOf(binding, agent)
    return id === undefined ? undefined : readRole(dirs, id)
  }

  /** @param dirs - scope directories. @param id - role id. @returns recent note entries for a card. */
  const recentNotes = (dirs: ResolvedDirs, id: string): NoteEntry[] => readNotes(dirs, id).entries.slice(-config.notesShown)

  /**
   * Assert that the caller may edit role cards.
   * @param card - the caller's own card, when bound.
   * @throws Error when a bound role lacks the grant.
   */
  const assertCanEdit = (card: RoleCard | undefined): void => {
    if (card === undefined) return
    if (!card.fields.can.includes('edit-roles')) {
      throw new Error(`岗位 ${card.fields.id} 没有 edit-roles 权限，岗位卡只能由主代理或有该权限的岗位修改`)
    }
  }

  /**
   * Assert that the caller may write another role's notes or guide.
   * @param self - the caller's own card, when bound.
   * @param targetId - role being written.
   * @throws Error when the caller is a bound role without the `train` grant.
   */
  const assertCanTeach = (self: RoleCard | undefined, targetId: string): void => {
    if (self === undefined || self.fields.id === targetId) return
    if (!self.fields.can.includes('train')) {
      throw new Error(`岗位 ${self.fields.id} 只能写自己的笔记与指导；跨岗位写入需要 train 权限`)
    }
  }

  /** @param agent - calling agent. @returns a short label for notes and changelogs. */
  const callerLabel = (agent: AgentHandle | undefined): string => {
    try {
      const names = ctx.get('subagents')?.namesOf?.(agent) as { name?: unknown } | undefined
      if (typeof names?.name === 'string' && names.name !== '') return names.name
    } catch {
      // A non-tree agent has no name; the label is cosmetic.
    }
    return 'agent'
  }

  return {
    ctx,
    config,
    packageRoot,
    defineTool,
    dirsOf,
    selfCardOf,
    recentNotes,
    assertCanEdit,
    assertCanTeach,
    callerLabel,
  }
}
