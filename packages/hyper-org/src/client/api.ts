/**
 * The orders board's HTTP surface: one route prefix, one request wrapper and
 * the single stage-move request shape.
 *
 * Drag-and-drop, the inspector's stage menu and the drop dialog all build their
 * request here, so there is exactly one way a stage changes from this panel —
 * the same `PATCH /hyper-org/api/order/:id` an Agent's `org_order update` takes.
 * The Host owns every gate; this module only speaks the wire format.
 */

/** Route prefix owned by the Host half. */
export const API = '/hyper-org/api'

/** The failure shape `call` throws: a plain Error with the status and code. */
export interface ApiError extends Error {
  status?: number
  code?: string
}

/** What every route repeats in its body. */
interface ApiEnvelope {
  ok?: unknown
  error?: unknown
  code?: unknown
}

/**
 * Call one API route, turning a failure into a thrown Error with its status
 * and code.
 * @param path - route path, query included.
 * @param options - fetch options (method, headers, body).
 * @returns the parsed JSON body.
 * @throws ApiError when the response is not ok or the body says `ok: false`.
 */
export async function call<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, options)
  let body: ApiEnvelope = {}
  try {
    body = (await response.json()) as ApiEnvelope
  } catch {
    body = {}
  }
  if (!response.ok || body.ok === false) {
    // The Host's sentence is the explanation; never reword it.
    const fallback = `HTTP ${response.status}`
    const error = new Error(body.error ? String(body.error) : fallback) as ApiError
    error.status = response.status
    error.code = typeof body.code === 'string' ? body.code : undefined
    throw error
  }
  return body as T
}

/** @param failure - a thrown value. @returns its stable code, when it has one. */
export function errorCodeOf(failure: unknown): string | undefined {
  if (failure === null || typeof failure !== 'object') return undefined
  const code = (failure as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

/**
 * Build a query suffix; empty, null and undefined values are skipped.
 * @param query - parameter bag.
 * @returns `''` or `?a=1&b=2`.
 */
export function queryString(query?: Record<string, unknown> | null): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const text = params.toString()
  return text === '' ? '' : `?${text}`
}

/** The one request shape for a stage move. */
export interface StageRequest {
  path: string
  method: 'PATCH'
  body: { stage: string; note?: string }
}

/**
 * The one request shape for a stage move.
 *
 * A drop needs the note `update` already requires; an empty note adds no key,
 * which is why the Host answers `note_required` for a bare drop.
 * @param id - order id.
 * @param stage - target stage.
 * @param note - drop reason; `dropped` needs one.
 * @returns the request the panel sends.
 */
export function stageRequest(id: string, stage: string, note?: string): StageRequest {
  const reason = typeof note === 'string' ? note.trim() : ''
  return {
    path: `${API}/order/${encodeURIComponent(String(id))}`,
    method: 'PATCH',
    body: { stage: String(stage), ...(reason === '' ? {} : { note }) },
  }
}
