/**
 * Where role data lives, and the small amount of plugin state around it.
 *
 * Scope rule: global roles are shared by every session of this profile; project
 * roles belong to one project root and are meant to be committed with it. A
 * role id present in both resolves to the project copy, and the panel marks the
 * global one as shadowed.
 *
 * @module @chrock-hyper/dsh-hyper-roles/scopes
 */
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { dshHome, findProjectRoot, readJson } from '@chrock-hyper/dsh-hyper-shared/paths'

/** The two scopes a role can live in. */
export type RoleScope = 'global' | 'project'

/** Tunables this plugin reads from `<home>/roles/config.json`. */
export interface RoleConfig {
  /** `ctx.subagents` provider used by `role_spawn`. */
  provider: string
  /** Roster entries listed in the system prompt; the rest collapse into a count. */
  maxRosterRoles: number
  /** Upper bound for one role brief handed to a spawned child. */
  briefMaxChars: number
  /** Upper bound for the per-step "your role" section. */
  selfSectionMaxChars: number
  /** Per-step roster section; useful to disable in a profile with many roles. */
  rosterSection: boolean
  /** Experience entries quoted in `role action=brief`. */
  notesShown: number
}

/** Tunables this plugin reads from `<home>/roles/config.json`, with their defaults. */
export const DEFAULT_CONFIG: RoleConfig = {
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

/** Every configurable key; the file is per-key merged, so iteration order is fixed. */
const CONFIG_KEYS = Object.keys(DEFAULT_CONFIG) as Array<keyof RoleConfig>

/** Inputs that decide where a caller's role files live. */
export interface ResolveDirsOptions {
  /** DSH home directory; defaults to `dshHome()`. */
  home?: string
  /** The caller's working directory, when one is known. */
  cwd?: string
}

/** The two scope directories for one caller, plus the project root they came from. */
export interface ResolvedDirs {
  home: string
  globalDir: string
  projectRoot: string | undefined
  projectDir: string | undefined
}

/**
 * Copy one stored value over a default when the stored kind matches.
 *
 * The config file is user-editable, so a value's type is checked at runtime
 * instead of trusted; the cast after the check records exactly that.
 * @param target - effective configuration being assembled.
 * @param source - parsed config file, possibly empty.
 * @param key - the setting to copy.
 */
function copyConfigKey<K extends keyof RoleConfig>(
  target: RoleConfig,
  source: Record<string, unknown>,
  key: K,
): void {
  const value = source[key]
  if (value === undefined) return
  if (typeof value !== typeof DEFAULT_CONFIG[key]) return
  target[key] = value as RoleConfig[K]
}

/**
 * Read the plugin configuration, falling back to defaults per key.
 * @param home - DSH home directory.
 * @returns the effective configuration.
 */
export function loadConfig(home: string): RoleConfig {
  const stored = readJson(join(home, 'roles', 'config.json')) ?? {}
  const config: RoleConfig = { ...DEFAULT_CONFIG }
  for (const key of CONFIG_KEYS) copyConfigKey(config, stored, key)
  return config
}

/**
 * Merge a patch into the stored configuration.
 * @param home - DSH home directory.
 * @param patch - partial configuration; unknown keys are ignored.
 * @returns the effective configuration after the merge.
 */
export function saveConfig(home: string, patch: unknown): RoleConfig {
  const current = readJson(join(home, 'roles', 'config.json')) ?? {}
  const next: Record<string, unknown> = { ...current }
  // Anything non-null may be indexed; a JSON body is an object, and the read of a
  // missing key is what rejects the rest.
  const patched = patch === null || patch === undefined ? undefined : (patch as Record<string, unknown>)
  for (const key of CONFIG_KEYS) {
    const value = patched?.[key]
    if (value !== undefined && typeof value === typeof DEFAULT_CONFIG[key]) next[key] = value
  }
  writeJsonAtomic(join(home, 'roles', 'config.json'), next)
  return loadConfig(home)
}

/**
 * Resolve the two scope directories for one caller.
 * @param options - DSH home plus the caller's working directory, when known.
 * @returns global and (when a cwd is known) project role directories.
 */
export function resolveDirs(options: ResolveDirsOptions = {}): ResolvedDirs {
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
export function recordRecentProject(home: string, projectRoot: string): void {
  if (typeof projectRoot !== 'string' || projectRoot === '') return
  const file = join(home, 'roles', 'state.json')
  const state = readJson(file) ?? {}
  const recent = stringList(state.recentProjects)
  const next = [projectRoot, ...recent.filter((entry) => entry !== projectRoot)].slice(0, 10)
  writeJsonAtomic(file, { ...state, recentProjects: next })
}

/**
 * Read the remembered project roots, most recent first.
 * @param home - DSH home directory.
 * @returns absolute project roots.
 */
export function recentProjects(home: string): string[] {
  const state = readJson(join(home, 'roles', 'state.json')) ?? {}
  return stringList(state.recentProjects)
}

/** @param value - a value read from disk. @returns its string entries, ignoring the rest. */
function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

/**
 * Write JSON through a temporary sibling so a crash cannot truncate the file.
 * @param file - destination path.
 * @param value - JSON value.
 */
function writeJsonAtomic(file: string, value: unknown): void {
  mkdirSync(dirname(file), { recursive: true })
  const temporary = `${file}.tmp-${process.pid}`
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(temporary, file)
}
