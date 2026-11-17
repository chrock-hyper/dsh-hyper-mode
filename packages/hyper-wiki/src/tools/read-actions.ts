/**
 * Read actions: `list`, `search`, `read`, and `backlinks`.
 *
 * Every action reads both scopes — the global store and the caller's project
 * store — and returns the same `{ ok, action, summary, data }` shape.
 *
 * @module @chrock-studio/dsh-hyper-wiki/tools/read-actions
 */
import type { PageView } from '../store/pages.ts'
import type { PageSummary } from '../search.ts'
import type { ToolActionInput, ToolResult, ToolSuccess } from './context.ts'
import { failure, pickScope, presentScopes } from './context.ts'

/** Longest page body the tool returns inline. */
const MAX_BODY_CHARS = 20_000

/**
 * `list`: every page in both stores.
 * @param input - action input.
 * @returns the page list summary.
 */
export function listAction(input: ToolActionInput): ToolResult {
  const rows: PageSummary[] = []
  for (const scope of presentScopes(input)) {
    rows.push(...input.core.list(scope))
  }
  rows.sort((left, right) => {
    if (left.scope !== right.scope) return left.scope === 'global' ? -1 : 1
    return left.path.localeCompare(right.path)
  })
  const lines = rows.map(row => `${row.scope}  ${row.path}  — ${row.title}  [${row.status}]${row.tags.length > 0 ? `  #${row.tags.join(' #')}` : ''}`)
  return {
    ok: true,
    action: 'list',
    summary: rows.length === 0
      ? 'No wiki pages yet. Draft one with action "draft" and ask the human to approve it.'
      : `${rows.length} page(s):\n${lines.join('\n')}`,
    data: { pages: rows },
  }
}

/**
 * `search`: ranked matches across both stores.
 * @param input - action input.
 * @returns the match summary.
 */
export function searchAction(input: ToolActionInput): ToolResult {
  const query = typeof input.query === 'string' ? input.query : ''
  if (query.trim() === '') return failure('search', 'query is required for action "search"')
  const hits = []
  for (const scope of presentScopes(input)) {
    hits.push(...input.core.search(scope, query))
  }
  hits.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score
    return left.path.localeCompare(right.path)
  })
  const capped = hits.slice(0, input.core.maxResults)
  const lines = capped.map(hit => `[${hit.score}] ${hit.scope}  ${hit.path}  — ${hit.title}  [${hit.status}]`)
  return {
    ok: true,
    action: 'search',
    summary: capped.length === 0
      ? `No page matches "${query}".`
      : `${capped.length} match(es) for "${query}":\n${lines.join('\n')}`,
    data: { query, results: capped },
  }
}

/**
 * `read`: one page, its draft state, and its backlinks.
 * @param input - action input.
 * @returns the page view summary.
 */
export function readAction(input: ToolActionInput): ToolResult {
  if (input.path === undefined || input.path === '') return failure('read', 'path is required for action "read"')
  const chosen = pickScope(input, false)
  if (chosen.error !== undefined) return chosen.error
  const result = input.core.read(chosen.scope, input.path)
  if (result.ok !== true) return failure('read', result.message ?? 'cannot read page', result.code)
  return readSummary('read', result)
}

/**
 * Render one page view.
 * @param action - the action name.
 * @param result - store result.
 * @returns `{ ok, action, summary, data }`.
 */
function readSummary(action: string, result: PageView): ToolSuccess {
  const body = result.body ?? ''
  const clipped = body.length > MAX_BODY_CHARS
    ? `${body.slice(0, MAX_BODY_CHARS)}\n\n[truncated: ${body.length - MAX_BODY_CHARS} more characters; read the file to see the rest]`
    : body
  const backlinks = (result.backlinks ?? []).map(row => row.path)
  return {
    ok: true,
    action,
    summary: [
      `${result.scope}:${result.path} — ${result.title} [${result.status}]`,
      `tags: ${(result.tags ?? []).join(', ') || '(none)'}  updated: ${result.updated || '(none)'}`,
      `draft: ${result.draft === null || result.draft === undefined ? 'none' : `${result.draft.status} by ${result.draft.author}${result.draft.reason ? ` — ${result.draft.reason}` : ''}`}`,
      `backlinks: ${backlinks.length === 0 ? '(none)' : backlinks.join(', ')}`,
      '',
      clipped,
    ].join('\n'),
    data: {
      scope: result.scope,
      path: result.path,
      title: result.title,
      tags: result.tags,
      status: result.status,
      updated: result.updated,
      draft: result.draft,
      backlinks: result.backlinks,
      errors: result.errors,
      body: clipped,
    },
  }
}

/**
 * `backlinks`: pages that link to one page.
 * @param input - action input.
 * @returns the inbound-link summary.
 */
export function backlinksAction(input: ToolActionInput): ToolResult {
  if (input.path === undefined || input.path === '') return failure('backlinks', 'path is required for action "backlinks"')
  const chosen = pickScope(input, false)
  if (chosen.error !== undefined) return chosen.error
  let result = input.core.backlinks(chosen.scope, input.path)
  if (result.ok !== true && input.scope === undefined) {
    const other = input.scopes.global()
    if (other.wikiDir !== chosen.scope.wikiDir) result = input.core.backlinks(other, input.path)
  }
  if (result.ok !== true) return failure('backlinks', result.message ?? 'cannot read backlinks', result.code)
  const rows = result.backlinks ?? []
  return {
    ok: true,
    action: 'backlinks',
    summary: rows.length === 0
      ? `${result.path}: no inbound links.`
      : `${result.path}: ${rows.length} inbound link(s)\n${rows.map(row => `${row.path}  — ${row.title}`).join('\n')}`,
    data: { path: result.path, backlinks: rows },
  }
}
