/**
 * Tunables this plugin reads from `<home>/org/config.json`.
 *
 * Same shape as the role plugin's configuration: a plain JSON file merged over
 * defaults per key, because a link-installed bundle cannot statically import
 * schemastery to declare `Config`.
 *
 * @module @chrock-studio/dsh-hyper-mode/hyper-org/config
 */
import { join } from 'node:path'

import { readJson } from '../../shared/paths.js'

/** Defaults, also the whitelist of accepted keys. */
export const DEFAULT_CONFIG = {
  /** Orders allowed in active/review/blocked at once; extra work queues in intake. */
  wipLimit: 2,
  /** Rows quoted in the system-prompt pulse. */
  pulseRows: 3,
  /** Per-step work-in-progress section; disable in a profile that wants no company layer. */
  boardSection: true,
}

/**
 * Read the plugin configuration, falling back to defaults per key.
 * @param home - DSH home directory.
 * @returns the effective configuration.
 */
export function loadConfig(home) {
  const stored = readJson(join(home, 'org', 'config.json')) ?? {}
  const config = { ...DEFAULT_CONFIG }
  for (const key of Object.keys(DEFAULT_CONFIG)) {
    const value = stored[key]
    if (value === undefined) continue
    if (typeof value === typeof DEFAULT_CONFIG[key]) config[key] = value
  }
  return config
}
