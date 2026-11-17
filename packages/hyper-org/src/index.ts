/**
 * 公司层：在岗位制之上加「工单」，让一次工作成为可续接、可验收、可审计的对象。
 *
 * 依赖关系是真的，不是修辞：本插件复用 hyper-roles 的身份绑定投影（同一
 * projection key 由两家共享同一个单元）、岗位库（DRI 必须是已存在的岗位）
 * 与作用域解析（一个项目只有一个根，工单与岗位不会分家）。
 *
 * Mounted as one Host row. Module scope imports only Node builtins and local
 * modules: a rejected import becomes a bare `never started` row with the cause
 * hidden in the Host log, so shipped packages are resolved inside `apply()`.
 *
 * @module @chrock-studio/dsh-hyper-org
 */
import type { AgentHandle, HostContext } from '@chrock-studio/dsh-hyper-shared/host'
import { registerBinding, resolveDirs } from '@chrock-studio/dsh-hyper-roles/internal'

import { API_PREFIX, createApiHandler } from './api.ts'
import type { OrgConfig } from './config.ts'
import { loadConfig } from './config.ts'
import { renderPulse } from './marker.ts'
import { listOrders, orgDirs, type ScopeDirs } from './store.ts'
import { defineTool } from '@deepseek-ai/dsh-tools'

import type { BindingHandle, DefineTool } from './tools.ts'
import { buildOrgTools } from './tools.ts'

/** Cordis plugin name. */
export const name = 'hyper-org'
/** Hard dependencies: the tool registry and the prompt registry. */
export const inject = ['tools', 'systemPrompt']

/** The installed `sessions` service: a durable Session id resolves to the session object. */
interface SessionsService {
  get(id: string): unknown
}

/**
 * Install the plugin: read configuration, share the role binding projection,
 * then register the two tools and the work-in-progress pulse.
 * @param ctx - mounting context.
 */
export async function apply(ctx: HostContext): Promise<void> {
  const home = resolveDirs().home
  const config: OrgConfig = loadConfig(home)
  const binding: BindingHandle = await registerBinding(ctx)

  /**
   * Read one agent's working directory without letting an unavailable service
   * break a prompt assembly.
   * @param agent - calling agent, when a call has one.
   * @returns the directory, or undefined.
   */
  const cwdOf = (agent: AgentHandle | undefined): string | undefined => {
    if (agent?.session === undefined) return undefined
    try {
      const value = ctx.get('workingDirectory')?.get?.(agent.session)
      return typeof value === 'string' && value !== '' ? value : undefined
    } catch {
      return undefined
    }
  }

  /** @param agent - calling agent. @returns that caller's role scope directories. */
  const roleDirsForAgent = (agent: AgentHandle | undefined): ScopeDirs => resolveDirs({ home, cwd: cwdOf(agent) })

  const tools = buildOrgTools({
    ctx,
    config,
    roleDirsForAgent,
    binding,
    // Text-only tools: the narrower contract is pinned once, here.
    shipped: { defineTool: defineTool as unknown as DefineTool },
  })
  // `tools` and `systemPrompt` are hard dependencies (`inject`), so both
  // services are present before this body runs; the `!` records that instead
  // of guarding.
  for (const definition of tools) {
    ctx.effect(() => ctx.tools!.register(definition), `hyper-org: tool ${definition.name}`)
  }

  ctx.effect(
    () => ctx.systemPrompt!.section({
      name: 'hyper-org:pulse',
      order: 40,
      text: (context) => {
        if (!config.boardSection) return ''
        const agent = context.agent
        if (agent === undefined) return ''
        // The pulse is the lead's desk. A role agent gets its own card from
        // hyper-roles instead, and an order is handed to it in its task.
        if (binding?.stateOf !== undefined) {
          try {
            if (binding.stateOf(agent.session) !== null) return ''
          } catch {
            // An unreadable binding is treated as unbound.
          }
        }
        const dirs = orgDirs(roleDirsForAgent(agent))
        return renderPulse(listOrders(dirs), { wipLimit: config.wipLimit, rows: config.pulseRows })
      },
    }),
    'hyper-org: pulse section',
  )

  /**
   * Read one live session by id, tolerating an unavailable service.
   * @param sessionId - durable Session id from the panel's query string.
   * @returns the session object, or undefined.
   */
  const sessionOf = (sessionId: string | null | undefined): unknown => {
    if (typeof sessionId !== 'string' || sessionId === '') return undefined
    try {
      return (ctx.get('sessions') as SessionsService | undefined)?.get?.(sessionId) ?? undefined
    } catch {
      return undefined
    }
  }

  /**
   * Resolve one session's project directory for the board.
   * @param sessionId - durable Session id.
   * @returns the working directory, or undefined.
   */
  const cwdOfSession = (sessionId: string | null | undefined): string | undefined => {
    const session = sessionOf(sessionId)
    if (session === undefined) return undefined
    try {
      const value = ctx.get('workingDirectory')?.get?.(session)
      return typeof value === 'string' && value !== '' ? value : undefined
    } catch {
      return undefined
    }
  }

  /**
   * Read the role a session is bound to.
   *
   * Same projection and same fallback as `identityOf` in `tools.ts`: the
   * panel must not be able to sign an order its own session holds.
   * @param sessionId - durable Session id.
   * @returns the bound role id, or undefined for an unbound session.
   */
  const roleOfSession = (sessionId: string | null | undefined): string | undefined => {
    const session = sessionOf(sessionId)
    if (session === undefined || binding?.stateOf === undefined) return undefined
    try {
      const state = binding.stateOf(session)
      return state !== null && state !== undefined && typeof state.role === 'string' ? state.role : undefined
    } catch {
      return undefined
    }
  }

  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(
      () => webCtx.webServer!.register({
        kind: 'prefix',
        path: API_PREFIX,
        handler: createApiHandler({
          ctx: webCtx,
          home,
          config,
          // A session that cannot be read yields `undefined`: the route still
          // answers, with `actor.confirmed: false`, so the panel can say why.
          resolveSession: (sessionId) => {
            const session = sessionOf(sessionId)
            if (session === undefined) return undefined
            return { cwd: cwdOfSession(sessionId), role: roleOfSession(sessionId) }
          },
        }),
      }),
      'hyper-org: panel api',
    )
  })

  ctx.logger?.info?.(`hyper-org: mounted (${home})`)
}
