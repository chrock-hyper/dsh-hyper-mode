/**
 * Read handlers: the GET routes of the wiki API.
 *
 * @module @chrock-studio/dsh-hyper-wiki/api/reads
 */
import type { WikiResponse } from './http.ts'
import { sendJson, statusFor } from './http.ts'
import type { RequestFacts } from './router.ts'
import { WIKI_ROUTE_PREFIX } from './routes.ts'

/**
 * Run one read request.
 * @param ctx - the request facts: store, scope index, and scope resolution.
 * @param url - parsed request URL.
 * @param res - server response.
 */
export const handleGet = (ctx: RequestFacts, url: URL, res: WikiResponse): void => {
  const { core, scopes, requestCwd, scopeOf } = ctx
  const pathname = url.pathname
  if (pathname === `${WIKI_ROUTE_PREFIX}/pending`) {
    const cwd = requestCwd(url)
    // A drafts-only store still has something to review, so the count is
    // computed for every scope rather than gated on page presence.
    const rows = scopes.listScopes(cwd).map(scope => ({
      scope: scope.scope,
      exists: core.hasWiki(scope),
      pending: core.pending(scope),
    }))
    sendJson(res, 200, {
      ok: true,
      total: rows.reduce((sum, row) => sum + row.pending, 0),
      scopes: rows,
    })
    return
  }
  if (pathname === `${WIKI_ROUTE_PREFIX}/state`) {
    const cwd = requestCwd(url)
    sendJson(res, 200, { ok: true, ...core.scopeState(cwd) })
    return
  }
  const resolved = scopeOf(url)
  if (resolved.scope === undefined) {
    sendJson(res, resolved.status, resolved.body)
    return
  }
  const { scope } = resolved
  if (pathname === `${WIKI_ROUTE_PREFIX}/pages`) {
    sendJson(res, 200, { ok: true, scope: scope.scope, pages: core.list(scope) })
    return
  }
  if (pathname === `${WIKI_ROUTE_PREFIX}/drafts`) {
    // The list view needs metadata, not whole drafts; a draft body would
    // only add payload the panel never reads.
    const rows = core.drafts(scope).map(row => ({ ...row, text: undefined }))
    sendJson(res, 200, { ok: true, scope: scope.scope, drafts: rows })
    return
  }
  if (pathname === `${WIKI_ROUTE_PREFIX}/search`) {
    const query = url.searchParams.get('q') ?? ''
    sendJson(res, 200, { ok: true, scope: scope.scope, results: core.search(scope, query) })
    return
  }
  if (pathname === `${WIKI_ROUTE_PREFIX}/page`) {
    const result = core.read(scope, url.searchParams.get('path') ?? '')
    if (result.ok !== true) {
      sendJson(res, statusFor(result.code), result)
      return
    }
    sendJson(res, 200, result)
    return
  }
  if (pathname === `${WIKI_ROUTE_PREFIX}/backlinks`) {
    const result = core.backlinks(scope, url.searchParams.get('path') ?? '')
    if (result.ok !== true) {
      sendJson(res, statusFor(result.code), result)
      return
    }
    sendJson(res, 200, result)
    return
  }
  sendJson(res, 404, { ok: false, code: 'not_found', message: `no route: ${pathname}` })
}
