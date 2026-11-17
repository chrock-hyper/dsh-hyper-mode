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
 * The shipped `defineTool` helper is a plain peer import.
 *
 * This module is the facade: the config lives in `config.js`, the bundled skill
 * in `skill.js`, the host lookups in `host.js`, and the mounting in `mount.js`.
 *
 * @module @chrock-hyper/dsh-hyper-wiki
 */
import { defineTool } from '@deepseek-ai/dsh-tools'

import type { AgentHandle, HostContext } from '@chrock-hyper/dsh-hyper-shared/host'

import { createWikiApi } from './api.ts'
import { normalizeConfig } from './config.ts'
import { createGit } from './git.ts'
import {
  authorizeRequest,
  callerName,
  cwdOfSession,
  pickLogger,
  workingDirectoryOf,
} from './host.ts'
import { mountRoutes, registerBundledSkill } from './mount.ts'
import { registerWikiPrompt } from './prompt.ts'
import { createScopes, findProjectRoot, resolveHome } from './scopes.ts'
import { createWikiStore } from './store.ts'
import { createWikiTool } from './tools.ts'
import type { WikiToolFactory } from './tools/define.ts'

/** Cordis plugin name. */
export const name = 'dsh-wiki'

/** The tool registry is what the plugin is for; every other service is optional. */
export const inject = ['tools']

export { CONFIG_DEFAULTS, normalizeConfig } from './config.ts'
export {
  authorizeRequest,
  callerName,
  cwdOfSession,
  workingDirectoryOf,
} from './host.ts'
export { readBundledSkill } from './skill.ts'

/** The shipped tools module this plugin reads `defineTool` from. */
/**
 * Mount the wiki plugin.
 * @param ctx - Host plugin context.
 * @param config - the loader row's config.
 */
export function apply(ctx: HostContext, config?: unknown): void {
  const settings = normalizeConfig(config)
  const logger = pickLogger(ctx)
  const scopes = createScopes({
    home: settings.home ?? resolveHome(),
    recentLimit: settings.recentProjects,
  })
  const git = createGit({ bin: settings.gitBin, enabled: settings.git, logger })
  const core = createWikiStore({ scopes, git, logger, maxResults: settings.maxResults })

  /** Resolve the caller's directory and remember its project for the panel. */
  const toolCwdOf = (agent: AgentHandle | undefined): string | undefined => {
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

  // Text-only tool: the narrower factory contract is pinned once, here.
  const tool = createWikiTool(defineTool as unknown as WikiToolFactory, {
    core,
    scopes,
    cwdOf: toolCwdOf,
    callerOf: exec => callerName(ctx, exec?.agent),
  })
  // `inject` lists `tools`, so the registry exists before this callback runs.
  ctx.effect(() => ctx.tools!.register(tool), 'dsh-wiki: wiki tool')

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
