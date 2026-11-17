/**
 * HTTP plumbing for the wiki routes: body bounds, JSON responses, and the
 * loopback check.
 *
 * The panel has no session, so the route serves loopback callers only when the
 * composition's connection service is absent. Everything here is transport;
 * it knows nothing about pages or drafts.
 *
 * @module @chrock-studio/dsh-hyper-wiki/api/http
 */
import { isIP } from 'node:net'

/** Largest accepted JSON request body. */
export const MAX_BODY_BYTES = 256 * 1024

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
export function sendJson(res, status, payload) {
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
export function sendMethodNotAllowed(res, allow) {
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
export async function readBody(req, limit) {
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
export function drain(req) {
  req.resume?.()
}
