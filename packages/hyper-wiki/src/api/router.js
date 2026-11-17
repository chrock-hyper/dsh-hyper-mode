/**
 * Route dispatch for the wiki API: method matching and the request handler.
 *
 * @module @chrock-studio/dsh-hyper-wiki/api/router
 */
import { drain, MAX_BODY_BYTES, sendJson, sendMethodNotAllowed } from './http.js'
import { handleGet } from './reads.js'
import { READ_PATHS, WIKI_ROUTE_PREFIX, WRITE_PATHS } from './routes.js'
import { handlePost } from './writes.js'

/**
 * Build the request handler for the wiki API.
 * @param options - `core` store, `scopes` index, `authorize` callback returning
 *   a rejection status or undefined, and a logger.
 * @returns the node request handler and the body ceiling.
 */
export function createWikiApi(options) {
  const core = options.core
  const scopes = options.scopes ?? core.scopes
  const log = options.logger ?? {}
  const authorize = typeof options.authorize === 'function' ? options.authorize : undefined
  const sessionCwd = typeof options.cwdOf === 'function' ? options.cwdOf : () => undefined

  /**
   * The project directory one request addresses.
   *
   * A page fetch carries no credentials but it does carry the Session id of the
   * tab that issued it; the Host turns that into the project directory. An
   * explicit `cwd` stays supported for tests and for non-tab callers, and the
   * remembered recent project is only a last resort when no session was sent.
   * @param url - parsed request URL.
   * @returns an absolute directory, or an empty string when none is known.
   */
  const requestCwd = url => {
    const explicit = (url.searchParams.get('cwd') ?? '').trim()
    if (explicit !== '') return explicit
    const session = url.searchParams.get('session') ?? ''
    if (session !== '') return sessionCwd(session) ?? ''
    return scopes.readRecent()[0] ?? ''
  }

  /**
   * Resolve the scope one request addresses.
   * @param url - parsed request URL.
   * @returns `{ scope }` or `{ status, body }` for a bad request.
   */
  const scopeOf = url => {
    const name = (url.searchParams.get('scope') ?? 'global').trim()
    if (name !== 'global' && name !== 'project') {
      return { status: 400, body: { ok: false, code: 'wrong_scope', message: `unknown scope: ${name}` } }
    }
    const cwd = requestCwd(url)
    const scope = scopes.resolveScope(name, cwd)
    if (scope === undefined) {
      return {
        status: 400,
        body: { ok: false, code: 'wrong_scope', message: 'a project scope needs a cwd' },
      }
    }
    return { scope, cwd }
  }

  /** The facts a handler needs to answer one request. */
  const request = { core, scopes, requestCwd, scopeOf }

  /**
   * Answer one HTTP request.
   * @param req - node request.
   * @param res - node response.
   */
  const handler = async (req, res) => {
    try {
      if (authorize !== undefined) {
        const rejection = authorize(req)
        if (rejection !== undefined) {
          res.statusCode = rejection
          res.end()
          return
        }
      }
      let url
      try {
        url = new URL(req.url ?? '/', 'http://127.0.0.1')
      } catch {
        sendJson(res, 400, { ok: false, code: 'bad_url', message: 'malformed URL' })
        return
      }
      if (url.pathname !== WIKI_ROUTE_PREFIX && !url.pathname.startsWith(`${WIKI_ROUTE_PREFIX}/`)) {
        sendJson(res, 404, { ok: false, code: 'not_found', message: `no route: ${url.pathname}` })
        return
      }
      const sub = url.pathname.slice(WIKI_ROUTE_PREFIX.length) || '/'
      const reads = READ_PATHS.has(sub)
      const writes = WRITE_PATHS.has(sub)
      if (!reads && !writes) {
        drain(req)
        sendJson(res, 404, { ok: false, code: 'not_found', message: `no route: ${url.pathname}` })
        return
      }
      if (req.method === 'GET' || req.method === 'HEAD') {
        if (!reads) {
          drain(req)
          sendMethodNotAllowed(res, 'POST')
          return
        }
        handleGet(request, url, res)
        return
      }
      if (req.method === 'POST') {
        if (!writes) {
          drain(req)
          sendMethodNotAllowed(res, 'GET')
          return
        }
        await handlePost(request, url, req, res)
        return
      }
      drain(req)
      sendMethodNotAllowed(res, [reads ? 'GET' : '', writes ? 'POST' : ''].filter(Boolean).join(', '))
    } catch (error) {
      log.warn?.(`dsh-wiki: route failed: ${error?.stack ?? error}`)
      if (!res.headersSent) sendJson(res, 500, { ok: false, code: 'internal', message: 'internal error' })
      else res.end()
    }
  }

  return { handler, maxBodyBytes: MAX_BODY_BYTES }
}
