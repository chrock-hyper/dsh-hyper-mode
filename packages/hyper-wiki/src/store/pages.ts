/**
 * Store reads: page discovery, listing, one page, search, and backlinks.
 *
 * Every function here is a read of one scope. The page view joins the draft
 * read in, which is why the module is built with `readDraft` injected rather
 * than imported — drafts never read pages back.
 *
 * @module @chrock-hyper/dsh-hyper-wiki/store/pages
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import { parseDraft } from '../draft.ts'
import type { DraftBlock } from '../draft.ts'
import type { DraftReadResult } from './drafts.ts'
import { backlinksOf } from '../links.ts'
import type { BacklinkRow } from '../links.ts'
import { displayTitle, normalizePagePath, parsePage } from '../page.ts'
import type { ParsedPage, StoreFailure } from '../page.ts'
import { searchPages, toSummary } from '../search.ts'
import type { PageSummary, SearchHit } from '../search.ts'
import type { ScopeKind, WikiScope } from '../scopes.ts'
import { readText, walk } from './fs.ts'

/** One parsed page carrying the scope and id it was read from. */
export interface PageRow extends ParsedPage {
  scope: ScopeKind
  path: string
  text: string
}

/** The draft half of one page view. */
export interface PageDraftView extends DraftBlock {
  stale: boolean
  body: string
}

/** One page with its draft state and backlinks. */
export interface PageView {
  ok: true
  scope: ScopeKind
  path: string
  title: string
  tags: string[]
  status: string
  updated: string
  body: string
  text: string
  errors: string[]
  draft: PageDraftView | null
  backlinks: BacklinkRow[]
}

/** Reading one page either succeeds or reports why not. */
export type PageReadResult = PageView | StoreFailure

/** Inbound links to one page. */
export interface BacklinksView {
  ok: true
  path: string
  backlinks: BacklinkRow[]
}

/** Reading backlinks either succeeds or reports why not. */
export type BacklinksResult = BacklinksView | StoreFailure

/** What `createPageOps` needs from the facade. */
export interface PageOpsOptions {
  readDraft: (scope: WikiScope, rawPath: unknown) => DraftReadResult
  maxResults: number
}

/**
 * Build the read side of the store.
 * @param options - the draft reader and the search result ceiling.
 * @returns the read API the facade composes.
 */
export function createPageOps(options: PageOpsOptions) {
  const readDraft = options.readDraft
  const maxResults = options.maxResults

  /**
   * Load every page of one scope.
   * @param scope - scope descriptor.
   * @returns parsed pages carrying `scope` and `path`.
   */
  const pages = (scope: WikiScope): PageRow[] => {
    const rows: PageRow[] = []
    for (const path of walk(scope.wikiDir, scope.wikiDir)) {
      const text = readText(join(scope.wikiDir, ...path.split('/')))
      if (text === undefined) continue
      const page = parsePage(text)
      rows.push({ ...page, scope: scope.scope, path, text })
    }
    rows.sort((left, right) => left.path.localeCompare(right.path))
    return rows
  }

  /**
   * The page list of one scope.
   * @param scope - scope descriptor.
   * @returns public summaries.
   */
  const list = (scope: WikiScope): PageSummary[] => pages(scope).map(page => toSummary(page))

  /**
   * Read one page plus its draft and backlinks.
   * @param scope - scope descriptor.
   * @param rawPath - page id.
   * @returns the page view, or a `not_found` / `invalid_path` failure.
   */
  const read = (scope: WikiScope, rawPath: unknown): PageReadResult => {
    const normalized = normalizePagePath(rawPath)
    if (!normalized.ok) return normalized
    const file = join(scope.wikiDir, ...normalized.path.split('/'))
    const text = readText(file)
    if (text === undefined) {
      return { ok: false, code: 'not_found', message: `no such page: ${normalized.path}` }
    }
    const page = parsePage(text)
    const draft = readDraft(scope, normalized.path)
    return {
      ok: true,
      scope: scope.scope,
      path: normalized.path,
      title: displayTitle(page, normalized.path),
      tags: page.tags,
      status: page.status ?? 'unknown',
      updated: page.updated ?? '',
      body: page.body,
      text,
      errors: page.errors,
      draft: draft.ok ? { ...draft.draft, stale: draft.stale, body: parseDraft(draft.text).body } : null,
      backlinks: backlinksOf(pages(scope), normalized.path),
    }
  }

  /**
   * Whether one page exists in a scope.
   * @param scope - scope descriptor.
   * @param rawPath - page id.
   * @returns the presence flag; an invalid id is absent.
   */
  const hasPage = (scope: WikiScope, rawPath: unknown): boolean => {
    const normalized = normalizePagePath(rawPath)
    if (!normalized.ok) return false
    return existsSync(join(scope.wikiDir, ...normalized.path.split('/')))
  }

  /**
   * Search one scope.
   * @param scope - scope descriptor.
   * @param query - raw query text.
   * @param limit - optional ceiling.
   * @returns ranked summaries.
   */
  const search = (scope: WikiScope, query: unknown, limit = maxResults): SearchHit[] =>
    searchPages(pages(scope), query, limit)

  /**
   * Inbound links to one page.
   * @param scope - scope descriptor.
   * @param rawPath - page id.
   * @returns `{ ok, path, backlinks }`, or `not_found` when the page is absent.
   */
  const backlinks = (scope: WikiScope, rawPath: unknown): BacklinksResult => {
    const normalized = normalizePagePath(rawPath)
    if (!normalized.ok) return normalized
    const all = pages(scope)
    if (!all.some(page => page.path === normalized.path)) {
      return { ok: false, code: 'not_found', message: `no such page: ${normalized.path}` }
    }
    return { ok: true, path: normalized.path, backlinks: backlinksOf(all, normalized.path) }
  }

  return { pages, list, read, hasPage, search, backlinks }
}
