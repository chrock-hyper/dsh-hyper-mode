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
 * is loaded inside `apply()` through `lib/shipped.js`, because the Cordis
 * loader turns a rejected plugin import into a bare `never started` row.
 *
 * @module dsh-wiki
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { isLoopbackAddress, WIKI_ROUTE_PREFIX } from './lib/api.js'
import { createWikiApi } from './lib/api.js'
import { createGit, DEFAULT_GIT_BIN } from './lib/git.js'
import { splitFrontmatter } from './lib/page.js'
import { registerWikiPrompt } from './lib/prompt.js'
import { createScopes, findProjectRoot, resolveHome } from './lib/scopes.js'
import { loadShipped } from './lib/shipped.js'
import { createWikiStore } from './lib/store.js'
import { createWikiTool } from './lib/tools.js'

/** Cordis plugin name. */
export const name = 'dsh-wiki'

/** The tool registry is what the plugin is for; every other service is optional. */
export const inject = ['tools']

/** Defaults for everything a composition may tune. */
export const CONFIG_DEFAULTS = {
  /** Absolute DSH home override; defaults to `$DSH_HOME` and then `~/.dsh`. */
  home: undefined,
  /** Inject the four-line wiki section into the system prompt. */
  prompt: true,
  /** Keep the global store in git. The project store never runs git. */
  git: true,
  /** Executable used for the global store's history. */
  gitBin: DEFAULT_GIT_BIN,
  /** Search result ceiling. */
  maxResults: 20,
  /** Recent projects the panel remembers. */
  recentProjects: 8,
  /** Register the bundled `wiki-draft-review` skill when the skills service exists. */
  skill: true,
}

/** The bundled skill's instruction file and its resource directory. */
const SKILL_FILE = new URL('./skills/wiki-draft-review/SKILL.md', import.meta.url)
const SKILL_DIR = new URL('./skills/wiki-draft-review/', import.meta.url)

/**
 * Normalize the row's `config` object.
 *
 * Values are validated leniently: an unusable value falls back to its default
 * instead of failing activation, so a typo in a patch cannot take the wiki
 * down with it.
 * @param input - raw config from the loader row.
 * @returns the resolved settings.
 */
export function normalizeConfig(input) {
  const raw = input !== null && typeof input === 'object' && !Array.isArray(input) ? input : {}
  const settings = { ...CONFIG_DEFAULTS }
  if (typeof raw.home === 'string' && raw.home.startsWith('/')) settings.home = raw.home
  if (typeof raw.prompt === 'boolean') settings.prompt = raw.prompt
  if (typeof raw.git === 'boolean') settings.git = raw.git
  if (typeof raw.skill === 'boolean') settings.skill = raw.skill
  if (typeof raw.gitBin === 'string' && raw.gitBin.trim() !== '') settings.gitBin = raw.gitBin.trim()
  settings.maxResults = clampInt(raw.maxResults, 1, 200, CONFIG_DEFAULTS.maxResults)
  settings.recentProjects = clampInt(raw.recentProjects, 1, 50, CONFIG_DEFAULTS.recentProjects)
  return settings
}

/**
 * Clamp an optional integer setting.
 * @param value - candidate value.
 * @param min - inclusive minimum.
 * @param max - inclusive maximum.
 * @param fallback - value used when the candidate is not a finite number.
 * @returns the resolved integer.
 */
function clampInt(value, min, max, fallback) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.floor(value)))
}

/**
 * Pick the logger the Host provides, with a console fallback so a missing
 * logger never breaks a mutation path.
 * @param ctx - plugin context.
 * @returns an object with at least `warn` and `debug`.
 */
function pickLogger(ctx) {
  const logger = ctx?.logger
  if (logger !== undefined && logger !== null && typeof logger.warn === 'function') {
    return {
      warn: message => logger.warn(message),
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
export function callerName(ctx, agent) {
  if (agent === undefined || agent === null) return 'agent'
  try {
    const names = ctx?.get?.('subagents')?.namesOf?.(agent)
    const self = names?.self
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
export function workingDirectoryOf(ctx, agent) {
  if (agent === undefined || agent === null) return undefined
  try {
    const cwd = ctx?.get?.('workingDirectory')?.get?.(agent.session)
    return typeof cwd === 'string' && cwd !== '' ? cwd : undefined
  } catch {
    return undefined
  }
}

/**
 * Read the bundled review skill.
 * @param file - the skill instruction file.
 * @returns the skill registration fields, or undefined when the file is
 *   missing or malformed.
 */
export function readBundledSkill(file = SKILL_FILE) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return undefined
  }
  const { fields, body } = splitFrontmatter(text)
  const skillName = typeof fields.name === 'string' ? fields.name : ''
  const description = typeof fields.description === 'string' ? fields.description : ''
  if (skillName === '' || description === '') return undefined
  return {
    name: skillName,
    description,
    ...(typeof fields.whenToUse === 'string' && fields.whenToUse !== '' ? { whenToUse: fields.whenToUse } : {}),
    content: body,
    source: 'runtime',
    resourceBase: { kind: 'directory', path: fileURLToPath(SKILL_DIR) },
  }
}

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
export function authorizeRequest(request) {
  return isLoopbackAddress(request?.socket?.remoteAddress) ? undefined : 401
}

/**
 * Resolve one session's working directory for the panel's tab.
 * @param ctx - plugin context.
 * @param sessionId - durable Session id, or null.
 * @returns the directory, or undefined when the session is not live.
 */
export function cwdOfSession(ctx, sessionId) {
  if (typeof sessionId !== 'string' || sessionId === '') return undefined
  try {
    const session = ctx?.get?.('sessions')?.get?.(sessionId)
    if (session === undefined) return undefined
    const cwd = ctx?.get?.('workingDirectory')?.get?.(session)
    return typeof cwd === 'string' && cwd !== '' ? cwd : undefined
  } catch {
    return undefined
  }
}

/**
 * Register the `/wiki` route, waiting for `webServer` when it mounts later.
 * @param ctx - plugin context.
 * @param handler - request handler.
 * @param logger - resolved logger.
 */
function mountRoutes(ctx, handler, logger) {
  const attach = host => {
    const server = host.get?.('webServer')
    if (server === undefined || server === null || typeof server.register !== 'function') return
    host.effect(
      () => server.register({ kind: 'prefix', path: WIKI_ROUTE_PREFIX, handler }),
      'dsh-wiki: /wiki routes',
    )
  }
  if (ctx.get?.('webServer') !== undefined) {
    attach(ctx)
    return
  }
  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], attach)
    return
  }
  logger.warn('dsh-wiki: webServer unavailable; the Wiki panel cannot load data')
}

/**
 * Register the bundled skill when the composition has a skill registry.
 * @param ctx - plugin context.
 * @param logger - resolved logger.
 */
function registerBundledSkill(ctx, logger) {
  const skill = readBundledSkill()
  if (skill === undefined) {
    logger.warn('dsh-wiki: skills/wiki-draft-review/SKILL.md is missing or malformed')
    return
  }
  const attach = host => {
    const skills = host.get?.('skills')
    if (skills === undefined || skills === null || typeof skills.register !== 'function') return
    host.effect(() => skills.register(skill), 'dsh-wiki: wiki-draft-review skill')
  }
  if (ctx.get?.('skills') !== undefined) {
    attach(ctx)
    return
  }
  if (typeof ctx.inject === 'function') ctx.inject(['skills'], attach)
}
