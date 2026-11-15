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
 * @module @chrock-studio/dsh-hyper-mode/hyper-org
 */
import { registerBinding } from '../hyper-roles/lib/binding.js'
import { resolveDirs } from '../hyper-roles/lib/scopes.js'
import { loadShipped } from '../shared/shipped.js'

import { buildOrgTools } from './lib/tools.js'
import { listOrders, orgDirs } from './lib/store.js'
import { renderPulse } from './lib/marker.js'
import { loadConfig } from './lib/config.js'

/** Cordis plugin name. */
export const name = 'hyper-org'
/** Hard dependencies: the tool registry and the prompt registry. */
export const inject = ['tools', 'systemPrompt']

/**
 * Install the plugin: read configuration, share the role binding projection,
 * then register the two tools and the work-in-progress pulse.
 * @param ctx - mounting context.
 */
export async function apply(ctx) {
  const home = resolveDirs().home
  const config = loadConfig(home)
  const binding = await registerBinding(ctx)

  /**
   * Read one agent's working directory without letting an unavailable service
   * break a prompt assembly.
   * @param agent - calling agent, when a call has one.
   * @returns the directory, or undefined.
   */
  const cwdOf = (agent) => {
    if (agent?.session === undefined) return undefined
    try {
      const value = ctx.get('workingDirectory')?.get?.(agent.session)
      return typeof value === 'string' && value !== '' ? value : undefined
    } catch {
      return undefined
    }
  }

  /** @param agent - calling agent. @returns that caller's role scope directories. */
  const roleDirsForAgent = (agent) => resolveDirs({ home, cwd: cwdOf(agent) })

  const tools = buildOrgTools({
    ctx,
    config,
    roleDirsForAgent,
    binding,
    shipped: loadShipped('@deepseek-ai/dsh-tools', ctx),
  })
  for (const definition of tools) {
    ctx.effect(() => ctx.tools.register(definition), `hyper-org: tool ${definition.name}`)
  }

  ctx.effect(
    () => ctx.systemPrompt.section({
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

  ctx.logger?.info?.(`hyper-org: mounted (${home})`)
}
