/**
 * Filesystem anchors shared by this bundle's plugins.
 *
 * Two facts every scope-aware plugin needs, and both are easy to get subtly
 * wrong: where DSH's own state lives, and which directory a session's project
 * root is.
 *
 * Module scope imports only Node builtins, because the Cordis loader turns a
 * rejected plugin import into a bare `never started` row whose cause stays in
 * the Host log.
 *
 * @module @chrock-hyper/dsh-hyper-shared/paths
 */
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve, sep } from 'node:path'

/**
 * Resolve DSH's home directory exactly as the shipped plugins do.
 * @param env - environment to read; defaults to the Host process environment.
 * @returns the absolute home directory, `~/.dsh` unless `DSH_HOME` overrides it.
 */
export function dshHome(env: NodeJS.ProcessEnv = process.env): string {
  const configured = typeof env.DSH_HOME === 'string' ? env.DSH_HOME.trim() : ''
  return configured === '' ? join(homedir(), '.dsh') : resolve(configured)
}

/**
 * Find the project root a session's directory belongs to.
 *
 * A project is the nearest ancestor holding a `.git` entry, which is the same
 * rule `skill-filesystem` uses for `<project>/.dsh/skills`; without one the
 * start directory itself is the root so project-scoped data still has a home.
 * @param start - absolute starting directory, normally a session's cwd.
 * @returns the absolute project root.
 */
export function findProjectRoot(start: string): string {
  const origin = resolve(start)
  let dir = origin
  while (true) {
    if (existsSync(join(dir, '.git'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return origin
    dir = parent
  }
}

/**
 * True when a resolved path stays inside a resolved parent.
 *
 * Every scope-aware write goes through this before touching the filesystem:
 * page and role ids come from model output and panel input, so `..` must not
 * be able to escape the scope directory.
 * @param parent - absolute directory the child must remain under.
 * @param child - absolute candidate path.
 * @returns whether the child is the parent or below it.
 */
export function isInside(parent: string, child: string): boolean {
  const root = resolve(parent)
  const target = resolve(child)
  return target === root || target.startsWith(`${root}${sep}`)
}

/**
 * Read a small JSON object, tolerating absence and malformed content.
 * @param file - absolute JSON path.
 * @returns the parsed object, or undefined when it is absent or unusable.
 */
export function readJson(file: string): Record<string, unknown> | undefined {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return undefined
  }
  try {
    const parsed: unknown = JSON.parse(text)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined
  } catch {
    return undefined
  }
}

/**
 * Report whether a path is absolute or resolve it against a base directory.
 * @param path - candidate path.
 * @param base - directory used for relative paths.
 * @returns an absolute path.
 */
export function absoluteFrom(path: string, base: string): string {
  return isAbsolute(path) ? resolve(path) : resolve(base, path)
}
