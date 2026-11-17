/**
 * The order board's HTTP plumbing: the loopback gate, bounded JSON bodies, the
 * refusal shape, and the two ways a route answers.
 *
 * Deliberately route-agnostic: `routes.ts` owns the surface, `handlers.ts`
 * assembles payloads, and this module knows neither.
 *
 * @module @chrock-hyper/dsh-hyper-org/api/http
 */
import type { HttpRequest, HttpResponse } from '@chrock-hyper/dsh-hyper-shared/host'

/** Largest accepted JSON body: a create or patch request, not a file upload. */
const MAX_BODY = 256 * 1024

/**
 * A thrown refusal, tagged with the HTTP answer `routes.respondError` replays.
 *
 * Plain `Error` keeps the identity callers rely on.
 */
export interface Refusal extends Error {
  status: number
  code: string
}

/** @param value - candidate object. @returns whether it is a JSON object to index. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * Read and parse a JSON request body.
 * @param req - incoming request.
 * @returns the parsed object; an empty body is an empty object.
 * @throws Error with status 400 and code `bad_body` when the body is unusable.
 */
export async function readJsonBody(req: HttpRequest): Promise<Record<string, unknown>> {
  const chunks: Uint8Array[] = []
  let total = 0
  for await (const chunk of req) {
    // A live socket yields Buffers; the interface also allows text, so encode
    // that case rather than letting it fail on a type mismatch.
    const bytes = typeof chunk === 'string' ? Buffer.from(chunk, 'utf8') : chunk
    total += bytes.length
    if (total > MAX_BODY) throw refusal(400, 'bad_body', `请求体超过 ${MAX_BODY / 1024} KiB`)
    chunks.push(bytes)
  }
  if (chunks.length === 0) return {}
  let value: unknown
  try {
    value = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw refusal(400, 'bad_body', '请求体不是 JSON')
  }
  if (!isRecord(value)) {
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
export function refusal(status: number, code: string, error: string): Refusal {
  return Object.assign(new Error(error), { status, code })
}

/**
 * Answer a method mismatch with 405 and the allowed verbs.
 * @param res - response.
 * @param used - the verb that arrived.
 * @param allowed - comma-separated verbs.
 * @param pathKnown - whether the path itself exists.
 */
export function sendMethod(res: HttpResponse, used: string, allowed: string, pathKnown: boolean): void {
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
export function isLoopback(address: unknown): boolean {
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
export function sendJson(res: HttpResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  // The server always provides `writeHead`; the shared view marks it optional.
  res.writeHead!(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

/** @param error - unknown thrown value. @returns its message. */
export function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
