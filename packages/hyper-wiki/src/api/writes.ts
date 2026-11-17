/**
 * Write handlers: the POST routes of the wiki API.
 *
 * @module @chrock-studio/dsh-hyper-wiki/api/writes
 */
import type { HttpRequest } from '@chrock-studio/dsh-hyper-shared/host'

import type { WikiResponse } from './http.ts'
import { MAX_BODY_BYTES, readBody, sendJson, statusFor } from './http.ts'
import type { RequestFacts } from './router.ts'
import { WIKI_ROUTE_PREFIX } from './routes.ts'

/**
 * Run one write request.
 * @param ctx - the request facts: store and scope resolution.
 * @param url - parsed request URL.
 * @param req - request.
 * @param res - server response.
 */
export const handlePost = async (
  ctx: RequestFacts,
  url: URL,
  req: HttpRequest,
  res: WikiResponse,
): Promise<void> => {
  const { core, scopeOf } = ctx
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
  let raw: unknown
  try {
    raw = body.text.trim() === '' ? {} : JSON.parse(body.text)
  } catch {
    sendJson(res, 400, { ok: false, code: 'bad_json', message: 'body must be JSON' })
    return
  }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    sendJson(res, 400, { ok: false, code: 'bad_json', message: 'body must be a JSON object' })
    return
  }
  const payload = raw as Record<string, unknown>
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
