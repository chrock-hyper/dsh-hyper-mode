/**
 * The order board's HTTP plumbing: the loopback gate, bounded JSON bodies, the
 * refusal shape, and the two ways a route answers.
 *
 * Deliberately route-agnostic: `routes.js` owns the surface, `handlers.js`
 * assembles payloads, and this module knows neither.
 *
 * @module @chrock-studio/dsh-hyper-org/api/http
 */

/** Largest accepted JSON body: a create or patch request, not a file upload. */
const MAX_BODY = 256 * 1024

/**
 * Read and parse a JSON request body.
 * @param req - incoming request.
 * @returns the parsed object; an empty body is an empty object.
 * @throws Error with status 400 and code `bad_body` when the body is unusable.
 */
export async function readJsonBody(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > MAX_BODY) throw refusal(400, 'bad_body', `请求体超过 ${MAX_BODY / 1024} KiB`)
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  let value
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw refusal(400, 'bad_body', '请求体不是 JSON')
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw refusal(400, 'bad_body', '请求体必须是 JSON 对象')
  }
  return value
}

/**
 * Build one refusal the responder can send as-is.
 * @param status - HTTP status.
 * @param code - stable error code.
 * @param error - sentence shown to the human.
 * @returns the error.
 */
export function refusal(status, code, error) {
  const value = new Error(error)
  value.status = status
  value.code = code
  return value
}

/**
 * Answer a method mismatch with 405 and the allowed verbs.
 * @param res - response.
 * @param used - the verb that arrived.
 * @param allowed - comma-separated verbs.
 * @param pathKnown - whether the path itself exists.
 */
export function sendMethod(res, used, allowed, pathKnown) {
  if (!pathKnown) {
    sendJson(res, 404, { ok: false, code: 'not_found', error: 'not found' })
    return
  }
  res.setHeader?.('allow', allowed)
  sendJson(res, 405, { ok: false, code: 'method_not_allowed', error: `${used} 不允许；用 ${allowed}` })
}

/**
 * True for loopback peer addresses, including IPv4-mapped IPv6.
 * @param address - socket remote address.
 * @returns whether the address is local.
 */
export function isLoopback(address) {
  if (typeof address !== 'string' || address === '') return false
  if (address === '::1' || address === '127.0.0.1' || address.startsWith('127.')) return true
  return address === '::ffff:127.0.0.1'
}

/**
 * Write one JSON response.
 * @param res - server response.
 * @param status - HTTP status.
 * @param value - JSON value.
 */
export function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

/** @param error - unknown thrown value. @returns its message. */
export function message(error) {
  return error instanceof Error ? error.message : String(error)
}
