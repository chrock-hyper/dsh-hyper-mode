/**
 * The three model-facing tools: read your role, delegate by role, edit roles.
 *
 * They are registered once at Host scope so every agent in every mode sees the
 * same definitions; what each call may do is decided per call from the caller's
 * bound role. Writes are deliberately narrower than reads: a child that is
 * working as a role may record experience for itself, while creating or
 * rewriting cards belongs to the lead or to a role granted `edit-roles`.
 *
 * This module is the entry point: it only assembles the handlers that live
 * under `tools/`, so the definition order and public exports stay fixed.
 *
 * @module @chrock-studio/dsh-hyper-roles/tools
 */
import type { ToolDefinition, ToolRuntimeOptions, ToolTextResult } from './tools/context.ts'
import { createToolContext } from './tools/context.ts'
import { createRoleTool } from './tools/role.ts'
import { createRoleEditTool } from './tools/role-edit.ts'
import type { ActivationResult } from './tools/role-spawn.ts'
import { createRoleSpawnTool } from './tools/role-spawn.ts'

export { rosterText } from './tools/catalog.ts'
export { modelOptions } from './tools/model-options.ts'

/** The definitions this plugin registers, in registration order. */
type RoleToolDefinitions = [
  ToolDefinition<ToolTextResult>,
  ToolDefinition<ActivationResult>,
  ToolDefinition<ToolTextResult>,
]

/**
 * Build the tool definitions for one mounted plugin instance.
 * @param options - context, configuration, scope resolver, projection handle and shipped helpers.
 * @returns the definitions to register.
 */
export function buildRoleTools(options: ToolRuntimeOptions): RoleToolDefinitions {
  const rt = createToolContext(options)
  return [createRoleTool(rt), createRoleSpawnTool(rt), createRoleEditTool(rt)]
}
