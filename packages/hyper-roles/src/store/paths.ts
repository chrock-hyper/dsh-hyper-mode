/**
 * Path resolution and atomic writes shared by every role store module.
 *
 * One rule governs the whole store: a role id is untrusted input (it arrives
 * from model tool arguments and from the panel's URL), so every path goes
 * through {@link roleFile}, which validates the id and proves the result stays
 * inside its scope directory.
 *
 * @module @chrock-studio/dsh-hyper-roles/store/paths
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { isInside } from '@chrock-studio/dsh-hyper-shared/paths'

import { ROLE_ID } from '../role-doc.ts'
import type { ResolvedDirs, RoleScope } from '../scopes.ts'

/** Directory that keeps archived roles, relative to a scope directory. */
export const ARCHIVE_DIR = '.archive'
/** Suffix that marks a notes file rather than a role card. */
export const NOTES_SUFFIX = '.notes.md'
/** Suffix that marks a reading guide rather than a role card. */
export const GUIDE_SUFFIX = '.guide.md'

/**
 * Resolve one role's card path, refusing ids that could escape the scope.
 * @param dir - scope directory.
 * @param id - role id.
 * @param suffix - file suffix, defaulting to the card's `.md`.
 * @returns the absolute path.
 */
export function roleFile(dir: string, id: string, suffix = '.md'): string {
  if (typeof id !== 'string' || !ROLE_ID.test(id)) throw new Error(`invalid role id "${String(id)}"`)
  const path = join(dir, `${id}${suffix}`)
  if (!isInside(dir, path)) throw new Error(`role path escapes its scope: ${path}`)
  return path
}

/**
 * Resolve a scope name to its directory.
 * @param dirs - resolved scope directories.
 * @param scope - `global` or `project`.
 * @returns the directory, or undefined when a project scope has no root.
 */
export function dirFor(dirs: ResolvedDirs, scope: RoleScope): string | undefined {
  if (scope === 'global') return dirs.globalDir
  if (scope === 'project') return dirs.projectDir
  throw new Error(`unknown role scope "${String(scope)}"`)
}

/**
 * Resolve a writable scope directory, creating it when necessary.
 * @param dirs - resolved scope directories.
 * @param scope - `global` or `project`.
 * @returns the directory.
 * @throws Error when the caller asked for a project scope without a project.
 */
export function requireDir(dirs: ResolvedDirs, scope: RoleScope): string {
  const dir = dirFor(dirs, scope)
  if (dir === undefined) {
    throw new Error('no project root is known for this caller, so project-scoped roles are unavailable; use scope "global" or run inside a project')
  }
  mkdirSync(dir, { recursive: true })
  return dir
}

/** @param path - file path. @returns its text, or an empty string when absent. */
export function readText(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

/**
 * Write text through a temporary sibling so readers never see a torn file.
 * @param path - destination.
 * @param text - content.
 */
export function writeText(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.tmp-${process.pid}`
  writeFileSync(temporary, text, 'utf8')
  renameSync(temporary, path)
}

/**
 * Append one line to a scope's change log.
 * @param dir - scope directory.
 * @param line - what happened, without the timestamp.
 */
export function appendChange(dir: string, line: string): void {
  const path = join(dir, 'CHANGELOG.md')
  const previous = readText(path)
  const entry = `- ${new Date().toISOString()} · ${line}\n`
  writeText(path, previous === '' ? `# 岗位变更记录\n\n${entry}` : `${previous.trimEnd()}\n${entry}`)
}
