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
import { boundRoleOf } from '../binding.js'
import { readNotes, readRole } from '../store.js'

/** Every result carries one model-facing text block; structured fields are for the UI. */
export const TEXT_OUTPUT = {
  type: 'object',
  additionalProperties: false,
  properties: { text: { type: 'string', required: true } },
}

/**
 * Build the context shared by the tool handlers.
 * @param options - context, configuration, scope resolver, projection handle and shipped helpers.
 * @returns the context every handler closes over.
 */
export function createToolContext(options) {
  const { ctx, config, packageRoot, dirsForAgent, binding, shipped } = options
  const { defineTool } = shipped

  /** @param agent - calling agent. @returns its scope directories. */
  const dirsOf = (agent) => dirsForAgent(agent)

  /** @param dirs - scope directories. @param agent - caller. @returns the caller's own card, if bound. */
  const selfCardOf = (dirs, agent) => {
    const id = boundRoleOf(binding, agent)
    return id === undefined ? undefined : readRole(dirs, id)
  }

  /** @param dirs - scope directories. @param id - role id. @returns recent note entries for a card. */
  const recentNotes = (dirs, id) => readNotes(dirs, id).entries.slice(-config.notesShown)

  /**
   * Assert that the caller may edit role cards.
   * @param card - the caller's own card, when bound.
   * @throws Error when a bound role lacks the grant.
   */
  const assertCanEdit = (card) => {
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
  const assertCanTeach = (self, targetId) => {
    if (self === undefined || self.fields.id === targetId) return
    if (!self.fields.can.includes('train')) {
      throw new Error(`岗位 ${self.fields.id} 只能写自己的笔记与指导；跨岗位写入需要 train 权限`)
    }
  }

  /** @param agent - calling agent. @returns a short label for notes and changelogs. */
  const callerLabel = (agent) => {
    try {
      const names = ctx.get('subagents')?.namesOf?.(agent)
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
