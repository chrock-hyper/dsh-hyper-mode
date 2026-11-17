/**
 * The panel's HTTP surface: one route prefix, one request wrapper, one error
 * shape.
 *
 * The Host owns every file operation (`src/api.ts` on that side); this module
 * only speaks the wire format, so the payload interfaces below mirror what the
 * route returns. Every payload carries `ok`, and a failure is thrown as an
 * `Error` with the status and code the panel reacts to.
 */

/** Route prefix owned by the Host half. */
export const API = '/hyper-roles/api'

/** Both role scopes; the panel switches between them. */
export type RoleScope = 'project' | 'global'

/** A role identified by scope and id — what a list row and the selection hold. */
export interface RoleRef {
  scope: RoleScope
  id: string
}

/** One role card as both scope listings report it. */
export interface RoleRow {
  id: string
  title: string
  version: number
  capabilities: string[]
  skills: string[]
  handoffs: string[]
  can: string[]
  summary: string
  scope: RoleScope
  path: string
  shadowed?: boolean
}

/** One card shipped inside the bundle. */
export interface BuiltinRow {
  id: string
  title: string
  version: number
  path: string
  source: 'builtin'
}

/** A card file that failed to parse; reported to the user, never thrown. */
export interface RoleProblem {
  scope: RoleScope
  path: string
  message: string
}

/** The card frontmatter, as the Host normalizes it. */
export interface RoleFields {
  id: string
  title: string
  version: number
  model: string
  capabilities: string[]
  skills: string[]
  handoffs: string[]
  can: string[]
}

/** One experience entry. */
export interface NoteEntry {
  at: string
  source: string
  text: string
}

/** `GET /api/state`: both scopes, the shipped cards, and the data locations. */
export interface RoleState {
  ok?: unknown
  projectRoot: string | null
  globalDir: string
  projectDir: string | null
  roles: { project: RoleRow[]; global: RoleRow[] }
  problems: RoleProblem[]
  builtins: BuiltinRow[]
}

/** `GET /api/role/:scope/:id`: one card with its notes and guide. */
export interface RoleDoc {
  ok?: unknown
  scope: RoleScope
  fields: RoleFields
  body: string
  notes: NoteEntry[]
  guide: string
  path: string
  revision: number
}

/** The fields a request failure carries on top of `Error`. */
export interface ApiError extends Error {
  status?: number
  code?: string
  currentVersion?: number
}

/** What every route's JSON body may contain, before its payload is known. */
interface WireBody {
  ok?: unknown
  error?: unknown
  code?: unknown
  currentVersion?: unknown
}

/**
 * Serialize query parameters, skipping empty values.
 * @param query - parameters; `undefined`, `null` and `''` are dropped.
 * @returns `?a=1&b=2`, or `''` when nothing is left.
 */
export function queryString(query: Record<string, string | number | null | undefined>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  const text = params.toString()
  return text === '' ? '' : `?${text}`
}

/**
 * Call one API route, turning a failure into a thrown error with its status.
 * @param path - route under {@link API}.
 * @param options - fetch options for methods that carry a body.
 * @returns the parsed JSON body, narrowed by the caller.
 * @throws ApiError when the response is not ok or reports `ok: false`.
 */
export async function call<T extends WireBody = WireBody>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, options)
  let body: WireBody = {}
  try {
    body = (await response.json()) as WireBody
  } catch {
    body = {}
  }
  if (!response.ok || body.ok === false) {
    // The Host sends a message on every failure; an empty one still has to
    // reach the banner, so fall back to the status.
    const message = body.error ? String(body.error) : `HTTP ${response.status}`
    const error = new Error(message) as ApiError
    error.status = response.status
    error.code = typeof body.code === 'string' ? body.code : undefined
    error.currentVersion = typeof body.currentVersion === 'number' ? body.currentVersion : undefined
    throw error
  }
  return body as T
}

/**
 * Whether a failure is the panel's version conflict (`409` + `stale`).
 * @param failure - any caught value.
 * @returns true when the caller should offer a reload instead of an error.
 */
export function isStale(failure: unknown): failure is ApiError & { currentVersion: number } {
  const error = failure as ApiError
  return failure instanceof Error && error.status === 409 && error.code === 'stale'
}
