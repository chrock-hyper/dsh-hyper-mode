/**
 * `/wiki/*` calls.
 *
 * The Host owns every file operation; this module only builds the request and
 * turns a failed response into an exception the panel can show.
 */

import type { ApiEnvelope, RequestBody } from './types.ts'

export const API = '/wiki'

/** The sidebar badge polls the pending count on this interval. */
export const BADGE_POLL_MS = 20000

/** A value the panel may put in a query string; empty values are omitted. */
export type QueryValue = string | number | boolean | null | undefined

/** Query parameters; `undefined`, `null` and `''` are skipped. */
export type Query = Record<string, QueryValue>

/**
 * Build a query string, skipping empty values.
 *
 * @param query - parameters.
 * @returns the encoded suffix, or an empty string.
 */
export function queryString(query?: Query): string {
  const params = new URLSearchParams()
  for (const key of Object.keys(query || {})) {
    const value = query?.[key]
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const text = params.toString()
  return text === '' ? '' : '?' + text
}

/**
 * Read one JSON response and turn a failure into an exception.
 *
 * @param response - fetch response.
 * @returns the body.
 */
async function readResponse<T extends ApiEnvelope>(response: Response): Promise<T> {
  const body: T = await response.json().catch(() => {
    throw new Error(response.status + ' ' + response.statusText)
  })
  if (!response.ok || body.ok === false) {
    throw new Error((body && body.message) || response.status + ' ' + response.statusText)
  }
  return body
}

/**
 * GET one API path.
 *
 * @param path - path below /wiki.
 * @param query - query parameters; empty values are omitted.
 * @returns the parsed JSON body.
 */
export async function apiGet<T extends ApiEnvelope>(path: string, query?: Query): Promise<T> {
  const response = await fetch(API + path + queryString(query), { cache: 'no-store' })
  return readResponse<T>(response)
}

/**
 * POST one API path.
 *
 * @param path - path below /wiki.
 * @param query - query parameters.
 * @param body - JSON body.
 * @returns the parsed JSON body.
 */
export async function apiPost<T extends ApiEnvelope>(
  path: string,
  query: Query | undefined,
  body: RequestBody | undefined,
): Promise<T> {
  const response = await fetch(API + path + queryString(query), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {}),
  })
  return readResponse<T>(response)
}

/**
 * Render a thrown value the way the panel always has: the message when there
 * is one, the value itself otherwise.
 *
 * @param failure - anything a `catch` caught.
 * @returns the text to show in a banner.
 */
export function errorText(failure: unknown): string {
  const candidate = typeof failure === 'object' && failure !== null && 'message' in failure
    ? (failure as { message?: unknown }).message
    : undefined
  if (candidate) return String(candidate)
  return String(failure)
}
