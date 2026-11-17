/**
 * dsh-wiki: a convention-first Markdown wiki for DeepSeek Harness.
 *
 * The convention is the product. A directory of Markdown files under
 * `$DSH_HOME/wiki/` (global) or `<projectRoot>/.dsh/wiki/` (project) is
 * readable and editable by any agent or editor without this plugin. What the
 * plugin adds is exactly three things: it validates the convention, it puts a
 * draft diff in front of a human, and it turns confirmation into one click.
 *
 * This module only assembles: it resolves the stores, registers the `wiki`
 * tool, the prompt section, the bundled review skill, and the `/wiki` routes.
 * Module scope imports only Node builtins and local modules — a shipped package
 * is loaded inside `apply()` through the shared `loadShipped` helper, because
 * the Cordis loader turns a rejected plugin import into a bare `never started`
 * row.
 *
 * This module is the facade: the config lives in `config.js`, the bundled skill
 * in `skill.js`, the host lookups in `host.js`, and the mounting in `mount.js`.
 *
 * @module @chrock-studio/dsh-hyper-wiki
 */
import { createWikiApi } from './api.js'
import { normalizeConfig } from './config.js'
import { createGit } from './git.js'
import {
  authorizeRequest,
  callerName,
  cwdOfSession,
  pickLogger,
  workingDirectoryOf,
} from './host.js'
import { mountRoutes, registerBundledSkill } from './mount.js'
import { registerWikiPrompt } from './prompt.js'
import { createScopes, findProjectRoot, resolveHome } from './scopes.js'
import { loadShipped } from '@chrock-studio/dsh-hyper-shared/shipped'
import { createWikiStore } from './store.js'
import { createWikiTool } from './tools.js'

/** Cordis plugin name. */
export const name = 'dsh-wiki'

/** The tool registry is what the plugin is for; every other service is optional. */
export const inject = ['tools']

export { CONFIG_DEFAULTS, normalizeConfig } from './config.js'
export {
  authorizeRequest,
  callerName,
  cwdOfSession,
  workingDirectoryOf,
} from './host.js'
export { readBundledSkill } from './skill.js'

/**
 * Mount the wiki plugin.
 * @param ctx - Host plugin context.
 * @param config - the loader row's config.
 */
export function apply(ctx, config) {
  const settings = normalizeConfig(config)
  const logger = pickLogger(ctx)
  const scopes = createScopes({
    home: settings.home ?? resolveHome(),
    recentLimit: settings.recentProjects,
  })
  const git = createGit({ bin: settings.gitBin, enabled: settings.git, logger })
  const core = createWikiStore({ scopes, git, logger, maxResults: settings.maxResults })

  /** Resolve the caller's directory and remember its project for the panel. */
  const toolCwdOf = agent => {
    const cwd = workingDirectoryOf(ctx, agent)
    if (cwd !== undefined) {
      try {
        scopes.noteRecent(findProjectRoot(cwd))
      } catch {
        // Bookkeeping for panel navigation must never fail a wiki call.
      }
    }
    return cwd
  }

  const { defineTool } = loadShipped('@deepseek-ai/dsh-tools', ctx)
  const tool = createWikiTool(defineTool, {
    core,
    scopes,
    cwdOf: toolCwdOf,
    callerOf: exec => callerName(ctx, exec?.agent),
  })
  ctx.effect(() => ctx.tools.register(tool), 'dsh-wiki: wiki tool')

  if (settings.prompt) {
    const disposer = registerWikiPrompt({
      ctx,
      scopes,
      cwdOf: agent => workingDirectoryOf(ctx, agent),
    })
    if (disposer === undefined) logger.debug('dsh-wiki: systemPrompt unavailable; no prompt section')
  }

  const api = createWikiApi({
    core,
    scopes,
    logger,
    authorize: request => authorizeRequest(request),
    cwdOf: sessionId => cwdOfSession(ctx, sessionId),
  })
  mountRoutes(ctx, api.handler, logger)

  if (settings.skill) registerBundledSkill(ctx, logger)
}
