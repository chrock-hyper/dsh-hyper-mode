/**
 * Load a package that ships with DSH, synchronously.
 *
 * A bundle does not declare dependencies on shipped packages, but a locally
 * linked bundle's own imports resolve from its real path, which cannot see the
 * installation's `node_modules`. So load by explicit path.
 *
 * The installation root is discovered, in order, from:
 *
 * 1. `ctx.get('profileContext').installAnchor` — the Host provides it as
 *    `<install>/@deepseek-ai/dsh/package.json` (`DSH_INSTALL_DIR` is derived from
 *    it, and is NOT set in the Host process; only shell commands receive it);
 * 2. `$DSH_INSTALL_DIR` — present in shell commands and CLI launches;
 * 3. Electron's `process.resourcesPath` and `process.execPath` layout.
 *
 * Deliberately synchronous and free of top-level `await`: the Cordis loader turns
 * a rejected plugin import into a bare `never started` row with the cause only in
 * the Host log, so this module must not depend on anything at import time.
 *
 * @module @chrock-studio/dsh-hyper-shared/shipped
 */
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

import type { HostContext } from './host.ts'

/** Resolution failures that justify the installation fallback. */
const NOT_FOUND = new Set(['ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND'])

const localRequire = createRequire(import.meta.url)

/**
 * Candidate `@deepseek-ai` package roots for this Host.
 * @param ctx - mounting context, used only to read `profileContext`.
 * @returns existing-looking roots in preference order.
 */
function packageRoots(ctx?: HostContext): string[] {
  const roots: string[] = []
  let anchor: unknown
  try {
    anchor = ctx?.get?.('profileContext')?.installAnchor
  } catch {
    anchor = undefined
  }
  if (typeof anchor === 'string') roots.push(join(dirname(anchor), '..'))
  if (process.env.DSH_INSTALL_DIR) roots.push(join(process.env.DSH_INSTALL_DIR, '..'))
  const electron = process as NodeJS.Process & { resourcesPath?: unknown }
  if (typeof electron.resourcesPath === 'string') {
    roots.push(join(electron.resourcesPath, 'app.asar', 'dsh', 'node_modules', '@deepseek-ai'))
  }
  if (typeof process.execPath === 'string') {
    roots.push(join(dirname(process.execPath), '..', 'Resources', 'app.asar', 'dsh', 'node_modules', '@deepseek-ai'))
  }
  return roots
}

/**
 * Resolve a shipped package from the installation.
 *
 * The return type is declared by the caller: nothing in this repository owns
 * those modules' shapes, so the seam stays honest rather than pretending to
 * know them.
 * @param spec - package specifier, e.g. `@deepseek-ai/dsh-tools`.
 * @param ctx - mounting context, so the Host's installation anchor can be read.
 * @returns the package's module namespace, typed as the caller declares.
 * @throws Error listing every anchor tried when the package cannot be found.
 */
export function loadShipped<T = unknown>(spec: string, ctx?: HostContext): T {
  try {
    return localRequire(spec) as T
  } catch (error) {
    const code = (error as { code?: string } | null)?.code
    if (code === undefined || !NOT_FOUND.has(code)) throw error
  }
  const name = spec.slice(spec.lastIndexOf('/') + 1)
  const tried: string[] = []
  for (const root of packageRoots(ctx)) {
    const dir = join(root, name)
    tried.push(dir)
    if (!existsSync(join(dir, 'package.json'))) continue
    return createRequire(join(dir, 'package.json'))(join(dir, 'lib/index.js')) as T
  }
  throw new Error(`cannot resolve ${spec}: no installation anchor matched (tried: ${tried.join(', ') || 'none'})`)
}
