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

import type { HttpRequest, HttpResponse } from '@chrock-studio/dsh-hyper-shared/host'

/** Largest accepted JSON request body. */
export const MAX_BODY_BYTES = 256 * 1024

/** Loopback literals allowed when no connection service guards the route. */
const LOOPBACK_V4 = /^127\./
const LOOPBACK_MAPPED = /^::ffff:127\./i

/** The node request additions this transport reads beyond the shared minimum. */
interface NodeRequest {
  headers: Record<string, string | string[] | undefined>
  resume?(): void
  [Symbol.asyncIterator](): AsyncIterator<Uint8Array | string>
}

/** The node additions this transport reads beyond the shared minimum. */
export interface WikiResponse extends HttpResponse {
  headersSent?: boolean
}

/** A body past the ceiling. */
export interface BodyTooLarge {
  tooLarge: true
  text?: undefined
}

/** A drained body. */
export interface BodyText {
  text: string
  tooLarge?: undefined
}

/** What draining one request body produced. */
export type BodyRead = BodyTooLarge | BodyText

/**
 * Whether an address is this machine.
 * @param address - a socket remote address.
 * @returns the loopback flag; an unknown address is not trusted.
 */
export function isLoopbackAddress(address: unknown): boolean {
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
export function statusFor(code: string): number {
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
export function sendJson(res: WikiResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.setHeader?.('content-type', 'application/json; charset=utf-8')
  res.setHeader?.('cache-control', 'no-store')
  res.end(JSON.stringify(payload))
}

/**
 * Send a bare status with an `allow` header.
 * @param res - server response.
 * @param allow - supported methods.
 */
export function sendMethodNotAllowed(res: WikiResponse, allow: string): void {
  res.statusCode = 405
  res.setHeader?.('allow', allow)
  res.setHeader?.('content-type', 'application/json; charset=utf-8')
  res.end(JSON.stringify({ ok: false, code: 'method_not_allowed', message: `use ${allow}` }))
}

/**
 * Drain one request body under a byte ceiling.
 * @param req - request.
 * @param limit - ceiling in bytes.
 * @returns the UTF-8 body, or `{ tooLarge: true }` past the ceiling.
 */
export async function readBody(req: HttpRequest, limit: number): Promise<BodyRead> {
  // The shared `HttpRequest` declares `[Symbol.asyncIterator]()` as returning
  // `AsyncIterable`, which is not itself an async iterator, and omits node's
  // `resume`. The object handed to the router is node's `IncomingMessage`, so
  // this describes that object exactly; the cast is type-only.
  const request = req as unknown as NodeRequest
  const declared = Number(request.headers?.['content-length'])
  if (Number.isFinite(declared) && declared > limit) {
    request.resume?.()
    return { tooLarge: true }
  }
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > limit) {
      request.resume?.()
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
export function drain(req: HttpRequest): void {
  // Same minimal-interface seam as `readBody`: the real object has `resume`.
  ;(req as { resume?(): void }).resume?.()
}
