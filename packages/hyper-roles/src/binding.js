/**
 * Durable role binding: which role a session is working as.
 *
 * The binding is folded from the session log rather than stored beside it. A
 * spawned child's first user message carries `<!-- role:<id> -->`, so resume,
 * fork and replay all reproduce the same identity — and a human can bind a
 * plain session by typing the same line. The fold is a host-only projection
 * unit, so it is driven by the framework, checkpointed with the session, and
 * never scans events on a prompt assembly.
 *
 * @module @chrock-studio/dsh-hyper-roles/binding
 */
import { extractRole, messageText } from './marker.js'

/** Projection key owned by this plugin. */
export const BINDING_KEY = 'hyperRolesBinding'
/** Bump when the folded state's shape or meaning changes. */
const STATE_VERSION = 1
/** Role ids the projection accepts from persisted state. */
const ROLE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/

/**
 * The projection unit itself: first bound message wins, every later event is
 * ignored by returning the same state reference.
 */
export const roleBindingDefinition = {
  key: BINDING_KEY,
  stateVersion: STATE_VERSION,
  /**
   * Validate one persisted or freshly folded state.
   * The registry only requires a `parse(value)` shape, so this replaces a Zod
   * schema without adding a dependency to a bundle that has none.
   * @param value - candidate state.
   * @returns the accepted state.
   * @throws Error when the persisted value is not a binding.
   */
  stateSchema: {
    parse(value) {
      if (value === null) return null
      if (value !== null && typeof value === 'object' && typeof value.role === 'string' && ROLE_ID.test(value.role)) {
        return { role: value.role }
      }
      throw new Error('hyper-roles: persisted role binding is not a role id')
    },
  },
  /** @returns no binding until a bound message is committed. */
  init: () => null,
  /**
   * Fold one committed session event.
   * @param state - binding so far.
   * @param event - committed session event.
   * @returns the same reference unless this event binds the session.
   */
  apply: (state, event) => {
    if (state !== null) return state
    if (event?.type !== 'user/message') return state
    const role = extractRole(messageText(event.data))
    return role === undefined ? state : { role }
  },
}

/**
 * Register the binding projection when the Host provides the service.
 * @param ctx - mounting context.
 * @returns the projection handle, or undefined when it cannot be registered.
 */
export async function registerBinding(ctx) {
  const projections = ctx.get('sessionProjections')
  if (projections === undefined) return undefined
  try {
    return await projections.register(roleBindingDefinition)
  } catch (error) {
    ctx.logger?.warn?.(`hyper-roles: role binding projection unavailable: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  }
}

/**
 * Read the role an agent is bound to.
 * @param handle - registered projection handle, when available.
 * @param agent - calling agent.
 * @returns the bound role id, or undefined for an unbound session.
 */
export function boundRoleOf(handle, agent) {
  const session = agent?.session
  if (handle === undefined || session === undefined) return undefined
  try {
    const state = handle.stateOf(session)
    return state !== null && state !== undefined && typeof state.role === 'string' ? state.role : undefined
  } catch {
    return undefined
  }
}
