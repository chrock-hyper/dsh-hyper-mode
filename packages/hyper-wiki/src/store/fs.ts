/**
 * Store filesystem primitives: bounded reads and the two tree walks.
 *
 * These helpers know nothing about drafts or pages beyond the shape of the
 * tree; callers decide what the ids mean.
 *
 * @module @chrock-studio/dsh-hyper-wiki/store/fs
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import type { Dirent } from 'node:fs'
import { join } from 'node:path'

import { DRAFT_PREFIX } from '../draft.ts'

/** Largest page file read; larger files are reported rather than loaded. */
const MAX_PAGE_BYTES = 1024 * 1024

/** Directory holding deleted pages. */
export const TRASH_PREFIX = '.trash'

  /**
   * Read one file, bounded.
   * @param file - absolute path.
   * @returns the text, or undefined when absent or too large.
   */
export const readText = (file: string): string | undefined => {
  try {
    const stat = statSync(file)
    if (!stat.isFile() || stat.size > MAX_PAGE_BYTES) return undefined
    return readFileSync(file, 'utf8')
  } catch {
    return undefined
  }
}

/**
 * Walk every Markdown file below a directory.
 * @param dir - absolute directory to scan.
 * @param base - the directory the returned ids are relative to.
 * @param depth - current depth, used to keep the reserved top-level names
 *   out of the page tree only at the root.
 * @returns relative POSIX paths.
 */
export const walk = (dir: string, base: string, depth = 0): string[] => {
  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const found: string[] = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name.startsWith('.')) continue
    if (depth === 0 && (entry.name === DRAFT_PREFIX || entry.name === TRASH_PREFIX)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      found.push(...walk(full, base, depth + 1))
      continue
    }
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    found.push(full.slice(base.length + 1).split(/[\\/]/).join('/'))
  }
  return found
}

/**
 * Walk the drafts directory, where the reserved-name rules do not apply.
 * @param dir - absolute drafts directory.
 * @param base - the directory the returned page ids are relative to.
 * @returns page ids the drafts mirror.
 */
export const walkDrafts = (dir: string, base: string): string[] => {
  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  const found: string[] = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      found.push(...walkDrafts(full, base))
      continue
    }
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    found.push(full.slice(base.length + 1).split(/[\\/]/).join('/'))
  }
  return found
}
