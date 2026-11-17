/**
 * Plugin config: defaults and lenient normalization.
 *
 * A typo in a patch must not take the wiki down with it, so every unusable
 * value falls back to its default instead of failing activation.
 *
 * @module @chrock-studio/dsh-hyper-wiki/config
 */
import { DEFAULT_GIT_BIN } from './git.js'

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
