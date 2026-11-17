/**
 * Tunables this plugin reads from `<home>/org/config.json`.
 *
 * Same shape as the role plugin's configuration: a plain JSON file merged over
 * defaults per key, because a link-installed bundle cannot statically import
 * schemastery to declare `Config`.
 *
 * @module @chrock-studio/dsh-hyper-org/config
 */
import { join } from 'node:path'

import { readJson } from '@chrock-studio/dsh-hyper-shared/paths'

/** The effective configuration of this plugin. */
export interface OrgConfig {
  /** Orders allowed in active/review/blocked at once; extra work queues in intake. */
  wipLimit: number
  /** Rows quoted in the system-prompt pulse. */
  pulseRows: number
  /** Per-step work-in-progress section; disable in a profile that wants no company layer. */
  boardSection: boolean
}

/** Defaults, also the whitelist of accepted keys. */
export const DEFAULT_CONFIG: OrgConfig = {
  /** Orders allowed in active/review/blocked at once; extra work queues in intake. */
  wipLimit: 2,
  /** Rows quoted in the system-prompt pulse. */
  pulseRows: 3,
  /** Per-step work-in-progress section; disable in a profile that wants no company layer. */
  boardSection: true,
}

/** Every configurable key; the file is per-key merged, so iteration order is fixed. */
const CONFIG_KEYS = Object.keys(DEFAULT_CONFIG) as Array<keyof OrgConfig>

/**
 * Copy one stored value over a default when the stored kind matches.
 *
 * The config file is user-editable, so a value's type is checked at runtime
 * instead of trusted; the cast after the check records exactly that.
 * @param target - effective configuration being assembled.
 * @param source - parsed config file, possibly empty.
 * @param key - the setting to copy.
 */
function copyConfigKey<K extends keyof OrgConfig>(
  target: OrgConfig,
  source: Record<string, unknown>,
  key: K,
): void {
  const value = source[key]
  if (value === undefined) return
  if (typeof value !== typeof DEFAULT_CONFIG[key]) return
  target[key] = value as OrgConfig[K]
}

/**
 * Read the plugin configuration, falling back to defaults per key.
 * @param home - DSH home directory.
 * @returns the effective configuration.
 */
export function loadConfig(home: string): OrgConfig {
  const stored = readJson(join(home, 'org', 'config.json')) ?? {}
  const config: OrgConfig = { ...DEFAULT_CONFIG }
  for (const key of CONFIG_KEYS) copyConfigKey(config, stored, key)
  return config
}
