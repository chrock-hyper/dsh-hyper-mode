/**
 * 岗位制编排：可编辑的角色卡 + durable 身份绑定 + 按岗位委派。
 *
 * Mounted as one Host row, so every mode and every session sees the same three
 * tools and the same roster. Identity is folded from the session log (see
 * `lib/binding.js`), role files live under a global and a project scope, and
 * the panel talks to the same store through `lib/api.js`.
 *
 * Module scope imports only Node builtins and local modules: a rejected import
 * becomes a bare `never started` row with the cause hidden in the Host log, so
 * shipped packages are resolved inside `apply()`.
 *
 * @module @chrock-studio/dsh-hyper-roles
 */
import { fileURLToPath } from 'node:url'

import { defineTool } from '@deepseek-ai/dsh-tools'

import type { AgentHandle, HostContext } from '@chrock-studio/dsh-hyper-shared/host'

import type { ApiState } from './api.ts'
import { API_PREFIX, createApiHandler } from './api.ts'
import type { RoleProjectionHandle } from './binding.ts'
import { boundRoleOf, registerBinding } from './binding.ts'
import { renderSelf } from './marker.ts'
import type { ResolvedDirs } from './scopes.ts'
import { recordRecentProject, resolveDirs, loadConfig } from './scopes.ts'
import { readNotes, readRole } from './store.ts'
import type { DefineTool } from './tools/context.ts'
import { buildRoleTools, rosterText } from './tools.ts'

/** Cordis plugin name. */
export const name = 'hyper-roles'
/** Hard dependencies: the tool registry and the prompt registry. */
export const inject = ['tools', 'systemPrompt']

/**
 * The installed `sessions` service: a durable Session id resolves to the
 * session object `workingDirectory` accepts.
 */
interface SessionsService {
  get(id: string): unknown
}

/**
 * Install the plugin: read the configuration, fold role bindings, then
 * register the tools and the two prompt sections.
 * @param ctx - mounting context.
 */
export async function apply(ctx: HostContext): Promise<void> {
  const packageRoot = fileURLToPath(new URL('../', import.meta.url))
  const home = resolveDirs().home
  const state: ApiState = { config: loadConfig(home) }
  const binding: RoleProjectionHandle | undefined = await registerBinding(ctx)
  /** Last project root written to the recent list, so steady-state reads do not touch disk. */
  let recordedRoot: string | undefined

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

  /**
   * Resolve one session's project directory, for the panel's tab.
   * The tab is session-scoped, so it reports which session it belongs to and
   * never needs a project picker of its own.
   * @param sessionId - durable Session id, or null.
   * @returns the working directory, or undefined.
   */
  const cwdOfSession = (sessionId: string | null | undefined): string | undefined => {
    if (typeof sessionId !== 'string' || sessionId === '') return undefined
    try {
      const session = (ctx.get('sessions') as SessionsService | undefined)?.get?.(sessionId)
      if (session === undefined) return undefined
      const value = ctx.get('workingDirectory')?.get?.(session)
      return typeof value === 'string' && value !== '' ? value : undefined
    } catch {
      return undefined
    }
  }

  /**
   * Resolve the scope directories a caller works against.
   * @param agent - calling agent, when known.
   * @returns the resolved directories.
   */
  const dirsForAgent = (agent: AgentHandle | undefined): ResolvedDirs => {
    const dirs = resolveDirs({ home, cwd: cwdOf(agent) })
    if (dirs.projectRoot !== undefined && dirs.projectRoot !== recordedRoot) {
      recordedRoot = dirs.projectRoot
      try {
        recordRecentProject(home, dirs.projectRoot)
      } catch {
        // The recent-project list is a convenience for the panel, never a fact.
      }
    }
    return dirs
  }

  const tools = buildRoleTools({
    ctx,
    config: state.config,
    packageRoot,
    dirsForAgent,
    binding,
    // The shipped helper is generic over schema specs; these three tools are
    // text-only, so the narrower contract is pinned once, here.
    shipped: { defineTool: defineTool as unknown as DefineTool },
  })
  // `tools` and `systemPrompt` are hard dependencies (`inject`), so both services
  // are present before this body runs; the `!` records that instead of guarding.
  for (const definition of tools) {
    ctx.effect(() => ctx.tools!.register(definition), `hyper-roles: tool ${definition.name}`)
  }

  ctx.effect(
    () => ctx.systemPrompt!.section({
      name: 'hyper-roles:self',
      order: 20,
      text: (context) => {
        const agent = context.agent
        if (agent === undefined) return ''
        const role = boundRoleOf(binding, agent)
        if (role === undefined) return ''
        const dirs = dirsForAgent(agent)
        const card = readRole(dirs, role)
        if (card === undefined) {
          return `## 你的岗位\n你被绑定到岗位 ${role}，但当前作用域里找不到它的卡片；`
            + '岗位文件可能被移动或改名，请让主代理确认，或用 `role` 的 action=list 查看现有岗位。'
        }
        return renderSelf(card, {
          guidePath: card.guidePath,
          noteCount: readNotes(dirs, role).entries.length,
          maxChars: state.config.selfSectionMaxChars,
        })
      },
    }),
    'hyper-roles: self section',
  )

  ctx.effect(
    () => ctx.systemPrompt!.section({
      name: 'hyper-roles:roster',
      order: 30,
      text: (context) => {
        if (!state.config.rosterSection) return ''
        const agent = context.agent
        if (agent !== undefined && boundRoleOf(binding, agent) !== undefined) return ''
        return rosterText(dirsForAgent(agent), { max: state.config.maxRosterRoles })
      },
    }),
    'hyper-roles: roster section',
  )

  ctx.inject(['webServer'], (webCtx) => {
    webCtx.effect(
      () => webCtx.webServer!.register({
        kind: 'prefix',
        path: API_PREFIX,
        handler: createApiHandler({
          ctx: webCtx,
          state,
          home,
          packageRoot,
          resolveCwd: (sessionId) => cwdOfSession(sessionId),
        }),
      }),
      'hyper-roles: panel api',
    )
  })

  ctx.logger?.info?.(`hyper-roles: mounted (${home})`)
}
