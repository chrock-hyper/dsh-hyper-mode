/**
 * Host facts: the logger, the caller's name and session directory, and the
 * route authorization fallback.
 *
 * Every helper here tolerates a composition that does not expose the service
 * it asks for; a missing service degrades the feature, never the plugin.
 *
 * @module @chrock-studio/dsh-hyper-wiki/host
 */
import type { AgentHandle, HostContext, HttpRequest } from '@chrock-studio/dsh-hyper-shared/host'

import { isLoopbackAddress } from './api.ts'

/** The logger shape this plugin calls; every method is always present. */
export interface WikiLogger {
  warn(message: string): void
  debug(message: string): void
}

/**
 * The `sessions` service shape this module reads. The shared Host types do not
 * cover it, and the plugin only needs "id in, session out".
 */
interface SessionsService {
  get(sessionId: string): unknown
}

/**
 * Pick the logger the Host provides, with a console fallback so a missing
 * logger never breaks a mutation path.
 * @param ctx - plugin context.
 * @returns an object with at least `warn` and `debug`.
 */
export function pickLogger(ctx: HostContext): WikiLogger {
  const logger = ctx?.logger
  if (logger !== undefined && logger !== null && typeof logger.warn === 'function') {
    return {
      warn: message => logger.warn?.(message),
      debug: message => (typeof logger.debug === 'function' ? logger.debug(message) : undefined),
    }
  }
  return {
    warn: message => console.warn(message),
    debug: () => undefined,
  }
}

/**
 * The caller's model-facing name, used as a draft author.
 * @param ctx - plugin context.
 * @param agent - the executing agent, when there is one.
 * @returns the subagent name, or `agent` when it cannot be resolved.
 */
export function callerName(ctx: HostContext, agent: AgentHandle | undefined): string {
  if (agent === undefined || agent === null) return 'agent'
  try {
    const names = ctx?.get?.('subagents')?.namesOf?.(agent)
    // `namesOf` is Host-defined and opaque here; only `self` is read.
    const self = (names as { self?: unknown } | undefined)?.self
    if (typeof self === 'string' && self !== '') return self
  } catch {
    // An unavailable subagent runtime is not an error for a draft author.
  }
  return 'agent'
}

/**
 * The session working directory of an agent, without throwing.
 * @param ctx - plugin context.
 * @param agent - the agent whose session is asked.
 * @returns the absolute directory, or undefined.
 */
export function workingDirectoryOf(ctx: HostContext, agent: AgentHandle | undefined): string | undefined {
  if (agent === undefined || agent === null) return undefined
  try {
    const cwd = ctx?.get?.('workingDirectory')?.get?.(agent.session)
    return typeof cwd === 'string' && cwd !== '' ? cwd : undefined
  } catch {
    return undefined
  }
}

/**
 * Decide whether a route request may proceed.
 *
 * The panel is a plain page fetch, so the connection carrier's credentials are
 * not available on it; requiring them made every button fail with 401. The
 * route therefore serves loopback callers only: the Host binds loopback by
 * default, and any other peer is refused here.
 * @param request - incoming request.
 * @returns 401 to reject, or undefined to proceed.
 */
export function authorizeRequest(request: HttpRequest): number | undefined {
  return isLoopbackAddress(request?.socket?.remoteAddress) ? undefined : 401
}

/**
 * Resolve one session's working directory for the panel's tab.
 * @param ctx - plugin context.
 * @param sessionId - durable Session id, or null.
 * @returns the directory, or undefined when the session is not live.
 */
export function cwdOfSession(ctx: HostContext, sessionId: unknown): string | undefined {
  if (typeof sessionId !== 'string' || sessionId === '') return undefined
  try {
    // The `sessions` service is outside the shared Host surface; only `get` is read.
    const sessions = ctx?.get?.('sessions') as SessionsService | undefined
    const session = sessions?.get?.(sessionId)
    if (session === undefined) return undefined
    const cwd = ctx?.get?.('workingDirectory')?.get?.(session)
    return typeof cwd === 'string' && cwd !== '' ? cwd : undefined
  } catch {
    return undefined
  }
}
