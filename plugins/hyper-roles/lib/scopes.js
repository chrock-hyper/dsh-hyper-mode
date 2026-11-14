/**
 * Where role data lives, and the small amount of plugin state around it.
 *
 * Scope rule: global roles are shared by every session of this profile; project
 * roles belong to one project root and are meant to be committed with it. A
 * role id present in both resolves to the project copy, and the panel marks the
 * global one as shadowed.
 *
 * @module @chrock-studio/dsh-hyper-mode/hyper-roles/scopes
 */
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { dshHome, findProjectRoot, readJson } from '../../shared/paths.js'

/** Tunables this plugin reads from `<home>/roles/config.json`. */
export const DEFAULT_CONFIG = {
  /** `ctx.subagents` provider used by `role_spawn`. */
  provider: 'spawn',
  /** Roster entries listed in the system prompt; the rest collapse into a count. */
  maxRosterRoles: 20,
  /** Upper bound for one role brief handed to a spawned child. */
  briefMaxChars: 6000,
  /** Upper bound for the per-step "your role" section. */
  selfSectionMaxChars: 1200,
  /** Per-step roster section; useful to disable in a profile with many roles. */
  rosterSection: true,
  /** Experience entries quoted in `role action=brief`. */
  notesShown: 3,
}

/**
 * Read the plugin configuration, falling back to defaults per key.
 * @param home - DSH home directory.
 * @returns the effective configuration.
 */
export function loadConfig(home) {
  const stored = readJson(join(home, 'roles', 'config.json')) ?? {}
  const config = { ...DEFAULT_CONFIG }
  for (const key of Object.keys(DEFAULT_CONFIG)) {
    const value = stored[key]
    if (value === undefined) continue
    if (typeof value === typeof DEFAULT_CONFIG[key]) config[key] = value
  }
  return config
}

/**
 * Merge a patch into the stored configuration.
 * @param home - DSH home directory.
 * @param patch - partial configuration; unknown keys are ignored.
 * @returns the effective configuration after the merge.
 */
export function saveConfig(home, patch) {
  const current = readJson(join(home, 'roles', 'config.json')) ?? {}
  const next = { ...current }
  for (const key of Object.keys(DEFAULT_CONFIG)) {
    if (patch?.[key] !== undefined && typeof patch[key] === typeof DEFAULT_CONFIG[key]) next[key] = patch[key]
  }
  writeJsonAtomic(join(home, 'roles', 'config.json'), next)
  return loadConfig(home)
}

/**
 * Resolve the two scope directories for one caller.
 * @param options - DSH home plus the caller's working directory, when known.
 * @returns global and (when a cwd is known) project role directories.
 */
export function resolveDirs(options = {}) {
  const home = options.home ?? dshHome()
  const globalDir = join(home, 'roles')
  const cwd = typeof options.cwd === 'string' && options.cwd !== '' ? options.cwd : undefined
  const projectRoot = cwd === undefined ? undefined : findProjectRoot(cwd)
  const projectDir = projectRoot === undefined ? undefined : join(projectRoot, '.dsh', 'roles')
  return { home, globalDir, projectRoot, projectDir }
}

/**
 * Remember a project root the agent actually worked in, so the panel can offer
 * it without binding itself to one session.
 * @param home - DSH home directory.
 * @param projectRoot - absolute project root.
 */
export function recordRecentProject(home, projectRoot) {
  if (typeof projectRoot !== 'string' || projectRoot === '') return
  const file = join(home, 'roles', 'state.json')
  const state = readJson(file) ?? {}
  const recent = Array.isArray(state.recentProjects) ? state.recentProjects.filter((entry) => typeof entry === 'string') : []
  const next = [projectRoot, ...recent.filter((entry) => entry !== projectRoot)].slice(0, 10)
  writeJsonAtomic(file, { ...state, recentProjects: next })
}

/**
 * Read the remembered project roots, most recent first.
 * @param home - DSH home directory.
 * @returns absolute project roots.
 */
export function recentProjects(home) {
  const state = readJson(join(home, 'roles', 'state.json')) ?? {}
  return Array.isArray(state.recentProjects) ? state.recentProjects.filter((entry) => typeof entry === 'string') : []
}

/**
 * Write JSON through a temporary sibling so a crash cannot truncate the file.
 * @param file - destination path.
 * @param value - JSON value.
 */
function writeJsonAtomic(file, value) {
  mkdirSync(dirname(file), { recursive: true })
  const temporary = `${file}.tmp-${process.pid}`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(temporary, file)
}
