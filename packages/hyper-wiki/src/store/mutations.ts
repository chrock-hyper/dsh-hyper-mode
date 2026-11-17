/**
 * Store mutations: direct page writes, deletion into `.trash/`, and rename.
 *
 * These are the effects a human triggers from the panel; the agent tool never
 * reaches them. A rename never rewrites the pages that link to the old id — it
 * reports them instead.
 *
 * @module @chrock-studio/dsh-hyper-wiki/store/mutations
 */
import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { draftPathOf } from '../draft.ts'
import type { GitCommitResult } from '../git.ts'
import { backlinksOf } from '../links.ts'
import type { BacklinkRow } from '../links.ts'
import {
  isPageStatus,
  isoInstant,
  isoTimestamp,
  normalizePagePath,
  parsePage,
  serializePage,
} from '../page.ts'
import type { StoreFailure } from '../page.ts'
import { writeFileAtomic } from '../scopes.ts'
import type { WikiScope } from '../scopes.ts'
import { TRASH_PREFIX } from './fs.ts'
import type { PageRow } from './pages.ts'

/** Deletion reports the trash path and the pages that still link to it. */
export interface RemoveView {
  ok: true
  path: string
  trashPath: string
  backlinks: BacklinkRow[]
  commit: GitCommitResult | undefined
}

/** Deletion either succeeds or reports why not. */
export type RemoveResult = RemoveView | StoreFailure

/** Rename reports the ids it moved between. */
export interface RenameView {
  ok: true
  from: string
  to: string
  backlinks: BacklinkRow[]
  draftLeftBehind: boolean
  commit: GitCommitResult | undefined
}

/** Rename either succeeds or reports why not. */
export type RenameResult = RenameView | StoreFailure

/** A direct page write reports whether it created the file. */
export interface WritePageView {
  ok: true
  path: string
  created: boolean
  commit: GitCommitResult | undefined
}

/** A direct page write either succeeds or reports why not. */
export type WritePageResult = WritePageView | StoreFailure

/** Fields `rename` reads. */
export interface RenameInput {
  from?: unknown
  to?: unknown
}

/** Fields `writePage` reads. */
export interface WritePageInput {
  path?: unknown
  content?: unknown
}

/** What `createMutationOps` needs from the facade. */
export interface MutationOpsOptions {
  now: () => Date
  commit: (scope: WikiScope, message: string) => GitCommitResult | undefined
  pages: (scope: WikiScope) => PageRow[]
}

/**
 * Build the mutating side of the store.
 * @param options - the clock, the scope commit, and the page reader used to
 *   report affected links.
 * @returns the mutation API the facade composes.
 */
export function createMutationOps(options: MutationOpsOptions) {
  const now = options.now
  const commitScope = options.commit
  const pages = options.pages

  /**
   * Move a page into `.trash/`.
   * @param scope - scope descriptor.
   * @param rawPath - page id.
   * @returns the trash path and the pages that still link to it.
   */
  const remove = (scope: WikiScope, rawPath: unknown): RemoveResult => {
    const normalized = normalizePagePath(rawPath)
    if (!normalized.ok) return normalized
    const pageFile = join(scope.wikiDir, ...normalized.path.split('/'))
    if (!existsSync(pageFile)) {
      return { ok: false, code: 'not_found', message: `no such page: ${normalized.path}` }
    }
    const affected = backlinksOf(pages(scope), normalized.path)
    const stamp = trashStamp(now())
    const trashRelative = `${TRASH_PREFIX}/${normalized.path}.${stamp}.md`
    const trashFile = join(scope.wikiDir, ...trashRelative.split('/'))
    try {
      mkdirSync(dirname(trashFile), { recursive: true })
      renameSync(pageFile, trashFile)
    } catch (error) {
      return { ok: false, code: 'write_failed', message: String((error as { message?: unknown } | null)?.message ?? error) }
    }
    const commit = commitScope(scope, `wiki: delete ${normalized.path}`)
    return { ok: true, path: normalized.path, trashPath: trashRelative, backlinks: affected, commit }
  }

  /**
   * Move a page to a new id, reporting the pages that link to the old one.
   * @param scope - scope descriptor.
   * @param input - `from` and `to` page ids.
   * @returns the move outcome; other pages are never rewritten.
   */
  const rename = (scope: WikiScope, input: RenameInput): RenameResult => {
    const from = normalizePagePath(input?.from)
    if (!from.ok) return from
    const to = normalizePagePath(input?.to)
    if (!to.ok) return to
    if (from.path === to.path) {
      return { ok: false, code: 'invalid_path', message: 'from and to are the same page' }
    }
    const fromFile = join(scope.wikiDir, ...from.path.split('/'))
    const toFile = join(scope.wikiDir, ...to.path.split('/'))
    if (!existsSync(fromFile)) {
      return { ok: false, code: 'not_found', message: `no such page: ${from.path}` }
    }
    if (existsSync(toFile)) {
      return { ok: false, code: 'conflict', message: `target exists: ${to.path}` }
    }
    const affected = backlinksOf(pages(scope), from.path)
    const draftFile = join(scope.wikiDir, ...draftPathOf(from.path).split('/'))
    const draftLeftBehind = existsSync(draftFile)
    try {
      mkdirSync(dirname(toFile), { recursive: true })
      renameSync(fromFile, toFile)
    } catch (error) {
      return { ok: false, code: 'write_failed', message: String((error as { message?: unknown } | null)?.message ?? error) }
    }
    const commit = commitScope(scope, `wiki: rename ${from.path} -> ${to.path}`)
    return {
      ok: true,
      from: from.path,
      to: to.path,
      backlinks: affected,
      draftLeftBehind,
      commit,
    }
  }

  /**
   * Write a page directly (the panel's editor — never a tool action).
   * @param scope - scope descriptor.
   * @param input - `path` and full page `content`.
   * @returns the write outcome.
   */
  const writePage = (scope: WikiScope, input: WritePageInput): WritePageResult => {
    const normalized = normalizePagePath(input?.path)
    if (!normalized.ok) return normalized
    if (typeof input?.content !== 'string' || input.content.trim() === '') {
      return { ok: false, code: 'invalid_content', message: 'content is required' }
    }
    const page = parsePage(input.content)
    if (page.status !== undefined && page.status !== '' && !isPageStatus(page.status)) {
      return { ok: false, code: 'invalid_status', message: `invalid status: ${page.status}` }
    }
    const file = join(scope.wikiDir, ...normalized.path.split('/'))
    const created = !existsSync(file)
    const text = serializePage({
      title: page.title,
      tags: page.tags,
      status: isPageStatus(page.status) ? page.status : 'wip',
      updated: isoTimestamp(now()),
      body: page.body,
    })
    try {
      writeFileAtomic(file, text)
    } catch (error) {
      return { ok: false, code: 'write_failed', message: String((error as { message?: unknown } | null)?.message ?? error) }
    }
    const commit = commitScope(scope, `wiki: ${created ? 'create' : 'edit'} ${normalized.path}`)
    return { ok: true, path: normalized.path, created, commit }
  }

  return { remove, rename, writePage }
}

/**
 * A filesystem-safe UTC stamp for a trashed page.
 * @param date - the clock value.
 * @returns `YYYYMMDDTHHMMSSmmmZ`.
 */
export function trashStamp(date: Date | number | string): string {
  return isoInstant(date).replace(/[-:.]/g, '')
}
