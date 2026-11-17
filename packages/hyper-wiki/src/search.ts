/**
 * Dependency-free page search.
 *
 * The design deliberately keeps retrieval simple: a case-insensitive substring
 * match over the page title (weight 3), tags (weight 2), and file name
 * (weight 2). No index, no tokenizer, no vector store. The body is not
 * searched: a page's title, tags, and path are what the convention asks an
 * author to keep meaningful.
 *
 * @module @chrock-studio/dsh-hyper-wiki/search
 */
import { displayTitle, stemOf } from './page.ts'

/** Field weights, highest first. */
export const SEARCH_WEIGHTS = {
  title: 3,
  tags: 2,
  name: 2,
}

/** Default result ceiling. */
export const DEFAULT_LIMIT = 20

/** The page fields search and listing read. */
export interface SearchablePage {
  scope?: unknown
  path?: unknown
  title?: unknown
  tags?: unknown
  status?: unknown
  updated?: unknown
}

/** The public page shape list and search results expose. */
export interface PageSummary {
  scope: unknown
  path: string
  title: string
  tags: string[]
  status: string
  updated: string
}

/** One scored search result. */
export type SearchHit = PageSummary & { score: number }

/**
 * Score one page against one query.
 * @param page - parsed page with its `path` (`title`, `tags`).
 * @param query - raw query text.
 * @returns the summed field weight, or 0 when the page does not match.
 */
export function scorePage(page: SearchablePage, query: unknown): number {
  const needle = String(query ?? '').trim().toLowerCase()
  if (needle === '') return 0
  let score = 0
  const title = displayTitle(page, page?.path ?? '').toLowerCase()
  if (title.includes(needle)) score += SEARCH_WEIGHTS.title
  const tags = Array.isArray(page?.tags) ? page.tags : []
  if (tags.some(tag => String(tag).toLowerCase().includes(needle))) score += SEARCH_WEIGHTS.tags
  const name = stemOf(page?.path ?? '').toLowerCase()
  if (name !== '' && name.includes(needle)) score += SEARCH_WEIGHTS.name
  return score
}

/**
 * Rank the store against one query.
 * @param pages - parsed pages, each carrying `scope` and `path`.
 * @param query - raw query text.
 * @param limit - result ceiling; defaults to 20.
 * @returns scored hits, highest score first and then by path, capped by the
 *   limit.
 */
export function searchPages(pages: readonly SearchablePage[], query: unknown, limit = DEFAULT_LIMIT): SearchHit[] {
  const ceiling = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : DEFAULT_LIMIT
  const hits: { page: SearchablePage; score: number }[] = []
  for (const page of pages) {
    const score = scorePage(page, query)
    if (score === 0) continue
    hits.push({ page, score })
  }
  hits.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score
    return String(left.page.path).localeCompare(String(right.page.path))
  })
  return hits.slice(0, ceiling).map(hit => ({ ...toSummary(hit.page), score: hit.score }))
}

/**
 * Project a parsed page onto the fields search and list results expose.
 * @param page - parsed page carrying `scope`, `path`, and `frontmatter`.
 * @returns the public summary shape.
 */
export function toSummary(page: SearchablePage): PageSummary {
  return {
    scope: page.scope,
    // Every caller feeds a page that came out of a store walk, so the id is a
    // string; the field stays `unknown` on the input to keep the seam small.
    path: page.path as string,
    title: displayTitle(page, page.path),
    tags: Array.isArray(page.tags) ? page.tags : [],
    status: typeof page.status === 'string' && page.status !== '' ? page.status : 'unknown',
    updated: typeof page.updated === 'string' ? page.updated : '',
  }
}
