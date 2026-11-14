/**
 * The `/wiki` HTTP routes the Web panel talks to.
 *
 * The panel has no session, so every request names a scope (`global` or
 * `project`) and, for a project scope, a directory: either an explicit `cwd`
 * query parameter or the most recent project the agent tools recorded.
 *
 * Authorization comes from the composition's `connection` service — its
 * Host/Origin fence and browser authentication — and falls back to loopback
 * only when that service is absent.
 *
 * @module dsh-wiki/lib/api
 */
import { isIP } from 'node:net'

/** Route prefix; the whole API sits under it. */
export const WIKI_ROUTE_PREFIX = '/wiki'

/** Largest accepted JSON request body. */
export const MAX_BODY_BYTES = 256 * 1024

/** Sub-paths that answer GET (and HEAD). */
const READ_PATHS = new Set(['/state', '/pages', '/page', '/drafts', '/pending', '/search', '/backlinks'])

/** Sub-paths that answer POST. `/page` is the only one that also reads. */
const WRITE_PATHS = new Set(['/draft', '/approve', '/reject', '/page', '/delete', '/rename'])

/** Loopback literals allowed when no connection service guards the route. */
const LOOPBACK_V4 = /^127\./
const LOOPBACK_MAPPED = /^::ffff:127\./i

/**
 * Whether an address is this machine.
 * @param address - a socket remote address.
 * @returns the loopback flag; an unknown address is not trusted.
 */
export function isLoopbackAddress(address) {
  if (typeof address !== 'string' || address === '') return false
  const plain = address.startsWith('::ffff:') ? address.slice('::ffff:'.length) : address
  if (plain === '::1' || plain === '0:0:0:0:0:0:0:1') return true
  if (isIP(plain) === 4) return LOOPBACK_V4.test(plain)
  if (isIP(address) === 6) return LOOPBACK_MAPPED.test(address)
  return false
}

/**
 * Map a store failure code onto an HTTP status.
 * @param code - the failure code.
 * @returns the status code.
 */
export function statusFor(code) {
  switch (code) {
    case 'not_found':
      return 404
    case 'conflict':
    case 'exists':
      return 409
    case 'wrong_scope':
      return 400
    case 'write_failed':
      return 500
    default:
      return 400
  }
}

/**
 * Send one JSON response.
 * @param res - server response.
 * @param status - HTTP status.
 * @param payload - JSON-serializable body.
 */
function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

/**
 * Send a bare status with an `allow` header.
 * @param res - server response.
 * @param allow - supported methods.
 */
function sendMethodNotAllowed(res, allow) {
  res.statusCode = 405
  res.setHeader('allow', allow)
  res.setHeader('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify({ ok: false, code: 'method_not_allowed', message: `use ${allow}` }))
}

/**
 * Drain one request body under a byte ceiling.
 * @param req - request.
 * @param limit - ceiling in bytes.
 * @returns the UTF-8 body, or `{ tooLarge: true }` past the ceiling.
 */
async function readBody(req, limit) {
  const declared = Number(req.headers?.['content-length'])
  if (Number.isFinite(declared) && declared > limit) {
    req.resume?.()
    return { tooLarge: true }
  }
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > limit) {
      req.resume?.()
      return { tooLarge: true }
    }
    chunks.push(buffer)
  }
  return { text: Buffer.concat(chunks, size).toString('utf8') }
}

/**
 * Discard a request body the router will not read, so the socket is not held
 * open waiting for a response the client never finishes sending.
 * @param req - node request.
 */
function drain(req) {
  req.resume?.()
}

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
    const cwd = (url.searchParams.get('cwd') ?? '').trim() || scopes.readRecent()[0]
    const scope = scopes.resolveScope(name, cwd)
    if (scope === undefined) {
      return {
        status: 400,
        body: { ok: false, code: 'wrong_scope', message: 'a project scope needs a cwd' },
      }
    }
    return { scope, cwd }
  }

  /**
   * Run one read request.
   * @param url - parsed request URL.
   * @param res - server response.
   */
  const handleGet = (url, res) => {
    const pathname = url.pathname
    if (pathname === `${WIKI_ROUTE_PREFIX}/pending`) {
      const cwd = (url.searchParams.get('cwd') ?? '').trim() || scopes.readRecent()[0]
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
      const cwd = (url.searchParams.get('cwd') ?? '').trim() || scopes.readRecent()[0]
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

  /**
   * Run one write request.
   * @param url - parsed request URL.
   * @param req - request.
   * @param res - server response.
   */
  const handlePost = async (url, req, res) => {
    const pathname = url.pathname
    const resolved = scopeOf(url)
    if (resolved.scope === undefined) {
      sendJson(res, resolved.status, resolved.body)
      return
    }
    const { scope } = resolved
    const body = await readBody(req, MAX_BODY_BYTES)
    if (body.tooLarge === true) {
      sendJson(res, 413, { ok: false, code: 'payload_too_large', message: `body exceeds ${MAX_BODY_BYTES} bytes` })
      return
    }
    let payload
    try {
      payload = body.text.trim() === '' ? {} : JSON.parse(body.text)
    } catch {
      sendJson(res, 400, { ok: false, code: 'bad_json', message: 'body must be JSON' })
      return
    }
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      sendJson(res, 400, { ok: false, code: 'bad_json', message: 'body must be a JSON object' })
      return
    }
    const path = typeof payload.path === 'string' ? payload.path : url.searchParams.get('path') ?? ''
    const actor = typeof payload.actor === 'string' && payload.actor !== '' ? payload.actor : 'human'
    let result
    if (pathname === `${WIKI_ROUTE_PREFIX}/draft`) {
      result = core.writeDraft(scope, {
        path,
        content: payload.content,
        title: payload.title,
        tags: payload.tags,
        status: payload.status,
        author: typeof payload.author === 'string' && payload.author !== '' ? payload.author : 'human',
      })
    } else if (pathname === `${WIKI_ROUTE_PREFIX}/approve`) {
      result = core.approve(scope, {
        path,
        actor,
        force: payload.force === true,
      })
    } else if (pathname === `${WIKI_ROUTE_PREFIX}/reject`) {
      result = core.reject(scope, { path, reason: payload.reason })
    } else if (pathname === `${WIKI_ROUTE_PREFIX}/page`) {
      result = core.writePage(scope, { path, content: payload.content })
    } else if (pathname === `${WIKI_ROUTE_PREFIX}/delete`) {
      result = core.remove(scope, path)
    } else if (pathname === `${WIKI_ROUTE_PREFIX}/rename`) {
      result = core.rename(scope, { from: payload.from ?? path, to: payload.to })
    } else {
      sendJson(res, 404, { ok: false, code: 'not_found', message: `no route: ${pathname}` })
      return
    }
    if (result.ok !== true) {
      sendJson(res, statusFor(result.code), result)
      return
    }
    sendJson(res, 200, result)
  }

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
        handleGet(url, res)
        return
      }
      if (req.method === 'POST') {
        if (!writes) {
          drain(req)
          sendMethodNotAllowed(res, 'GET')
          return
        }
        await handlePost(url, req, res)
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
