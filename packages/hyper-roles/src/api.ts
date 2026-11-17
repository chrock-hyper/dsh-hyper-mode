/**
 * The panel's HTTP surface.
 *
 * The panel is a static browser module, so it cannot call Host services
 * directly; this route is the one channel. Every mutation goes through the same
 * `store.js` functions the model tools use, so the panel and the agent can never
 * disagree about what a save means.
 *
 * Authentication reuses the connection carrier when the composition has one:
 * an otherwise ordinary route would let any local process edit role files.
 *
 * @module @chrock-hyper/dsh-hyper-roles/api
 */
import type { HostContext, HttpHandler, HttpRequest, HttpResponse } from '@chrock-hyper/dsh-hyper-shared/host'

import type { RoleFieldInput } from './role-doc.ts'
import type { ResolvedDirs, RoleConfig, RoleScope } from './scopes.ts'
import { recentProjects, resolveDirs, saveConfig } from './scopes.ts'
import {
  appendNote,
  archiveRole,
  copyBuiltin,
  createRole,
  listBuiltins,
  listRoles,
  readGuide,
  readNotes,
  readRoleIn,
  saveRole,
  writeGuide,
} from './store.ts'

/** Route prefix owned by this plugin. */
export const API_PREFIX = '/hyper-roles'
/** Largest accepted JSON body; a role card is small by nature. */
const MAX_BODY = 256 * 1024

/** Shared state the panel mirrors, owned by `apply`. */
export interface ApiState {
  config: RoleConfig
}

/** Everything the handler closes over. */
export interface ApiHandlerOptions {
  ctx: HostContext
  state: ApiState
  home: string
  packageRoot: string
  resolveCwd?: (sessionId: string | null) => string | undefined
}

/** The inputs `statePayload` reads. */
interface StatePayloadOptions {
  home: string
  dirs: ResolvedDirs
  state: ApiState
  packageRoot: string
}

/**
 * Build the request handler.
 * @param options - mounting context, shared state, DSH home, bundle root and
 *   a session-to-directory resolver.
 * @returns an HTTP handler for `ctx.webServer.register`.
 */
export function createApiHandler(options: ApiHandlerOptions): HttpHandler {
  const { ctx, state, home, packageRoot, resolveCwd } = options

  return async function handler(req, res) {
    const rejection = guard(req)
    if (rejection !== undefined) {
      sendJson(res, rejection, { ok: false, error: 'unauthorized' })
      return
    }

    let url: URL
    try {
      url = new URL(req.url ?? '/', 'http://localhost')
    } catch {
      sendJson(res, 400, { ok: false, error: 'bad url' })
      return
    }

    const segments = url.pathname.split('/').filter((segment) => segment !== '')
    if (segments[0] !== 'hyper-roles' || segments[1] !== 'api') {
      sendJson(res, 404, { ok: false, error: 'not found' })
      return
    }
    const rest = segments.slice(2)
    const cwd = resolveCwd?.(url.searchParams.get('session')) ?? url.searchParams.get('cwd') ?? undefined
    const dirs = resolveDirs({ home, cwd: cwd === '' ? undefined : cwd })

    try {
      if (req.method === 'GET' && rest.length === 1 && rest[0] === 'state') {
        sendJson(res, 200, statePayload({ home, dirs, state, packageRoot }))
        return
      }

      if (req.method === 'GET' && rest.length === 3 && rest[0] === 'role') {
        const scope = parseScope(segment(rest, 1))
        const card = readRoleIn(dirs, scope, segment(rest, 2))
        if (card === undefined) {
          sendJson(res, 404, { ok: false, error: `role "${segment(rest, 2)}" not found in ${scope} scope` })
          return
        }
        sendJson(res, 200, {
          ok: true,
          scope: card.scope,
          fields: card.fields,
          body: card.body,
          notes: readNotes(dirs, card.fields.id).entries,
          guide: readGuide(dirs, card.fields.id).text,
          path: card.path,
          revision: card.fields.version,
        })
        return
      }

      if (req.method === 'POST' && rest.length === 2 && rest[0] === 'role') {
        const scope = parseScope(segment(rest, 1))
        const body = await readJsonBody(req)
        if (body.fromBuiltin !== undefined) {
          const card = copyBuiltin(packageRoot, dirs, { id: String(body.fromBuiltin), scope })
          sendJson(res, 200, { ok: true, id: card.fields.id, revision: card.fields.version })
          return
        }
        const card = createRole(dirs, {
          scope,
          id: String(body.id ?? ''),
          title: body.title,
          body: body.body,
          // The panel sends an object; `normalizeFields` re-validates every field it reads.
          fields: (body.fields ?? {}) as RoleFieldInput,
        })
        sendJson(res, 200, { ok: true, id: card.fields.id, revision: card.fields.version })
        return
      }

      if (req.method === 'PUT' && rest.length === 3 && rest[0] === 'role') {
        const scope = parseScope(segment(rest, 1))
        const body = await readJsonBody(req)
        const card = saveRole(dirs, {
          scope,
          id: segment(rest, 2),
          // Same body contract as create: an object the store validates field by field.
          fields: (body.fields ?? {}) as RoleFieldInput,
          body: typeof body.body === 'string' ? body.body : undefined,
          expectedVersion: typeof body.expectedVersion === 'number' ? body.expectedVersion : undefined,
          actor: 'panel',
        })
        sendJson(res, 200, { ok: true, id: card.fields.id, revision: card.fields.version })
        return
      }

      if (req.method === 'POST' && rest.length === 4 && rest[0] === 'role' && rest[3] === 'archive') {
        const target = archiveRole(dirs, { scope: parseScope(segment(rest, 1)), id: segment(rest, 2) })
        sendJson(res, 200, { ok: true, archivedTo: target })
        return
      }

      if (req.method === 'POST' && rest.length === 4 && rest[0] === 'role' && rest[3] === 'note') {
        const body = await readJsonBody(req)
        const entry = appendNote(dirs, {
          scope: parseScope(segment(rest, 1)),
          id: segment(rest, 2),
          text: body.text,
          source: 'panel',
        })
        sendJson(res, 200, { ok: true, entry })
        return
      }

      if (req.method === 'PUT' && rest.length === 4 && rest[0] === 'role' && rest[3] === 'guide') {
        const body = await readJsonBody(req)
        const path = writeGuide(dirs, { scope: parseScope(segment(rest, 1)), id: segment(rest, 2), text: String(body.text ?? '') })
        sendJson(res, 200, { ok: true, path })
        return
      }

      if (req.method === 'PUT' && rest.length === 1 && rest[0] === 'config') {
        const body = await readJsonBody(req)
        const config = saveConfig(home, body.patch ?? body)
        Object.assign(state.config, config)
        sendJson(res, 200, { ok: true, config: state.config })
        return
      }

      sendJson(res, 404, { ok: false, error: 'not found' })
    } catch (error) {
      const failure = error as { code?: unknown; currentVersion?: unknown } | null | undefined
      if (failure?.code === 'stale') {
        sendJson(res, 409, { ok: false, code: 'stale', currentVersion: failure.currentVersion, error: message(error) })
        return
      }
      if (/already exists/.test(message(error))) {
        sendJson(res, 409, { ok: false, code: 'exists', error: message(error) })
        return
      }
      if (/does not exist|not found/.test(message(error))) {
        sendJson(res, 404, { ok: false, error: message(error) })
        return
      }
      sendJson(res, 400, { ok: false, error: message(error) })
    }
  }
}

/**
 * One path segment.
 *
 * Every branch above checks `rest.length` before reaching here, so the default
 * is never used for a matched route; it keeps `noUncheckedIndexedAccess` honest
 * instead of asserting the index away.
 * @param parts - the path after the API prefix.
 * @param index - segment position.
 * @returns the segment, or an empty string.
 */
function segment(parts: string[], index: number): string {
  return parts[index] ?? ''
}

/**
 * Decide whether a request may proceed.
 *
 * The panel is an ordinary page fetch, not the `/api` RPC client, so it carries
 * none of the connection carrier's credentials; requiring them made every
 * button fail with 401. The route therefore serves loopback callers only, which
 * is the narrowest policy that still works from the page: the Host binds
 * loopback by default, and a non-loopback peer is refused here.
 * @param req - incoming request.
 * @returns 401 when refused, undefined when allowed.
 */
function guard(req: HttpRequest): 401 | undefined {
  return isLoopback(req.socket?.remoteAddress) ? undefined : 401
}

/**
 * True for loopback peer addresses, including IPv4-mapped IPv6.
 * @param address - socket remote address.
 * @returns whether the address is local.
 */
function isLoopback(address: unknown): boolean {
  if (typeof address !== 'string' || address === '') return false
  if (address === '::1' || address === '127.0.0.1' || address.startsWith('127.')) return true
  return address === '::ffff:127.0.0.1'
}

/**
 * Assemble the panel's initial state.
 * @param options - home, resolved dirs, shared state and bundle root.
 * @returns the JSON payload.
 */
function statePayload(options: StatePayloadOptions): Record<string, unknown> {
  const { home, dirs, state, packageRoot } = options
  const listed = listRoles(dirs)
  return {
    ok: true,
    home,
    projectRoot: dirs.projectRoot ?? null,
    globalDir: dirs.globalDir,
    projectDir: dirs.projectDir ?? null,
    recentProjects: recentProjects(home),
    roles: { global: listed.global, project: listed.project },
    problems: listed.problems,
    builtins: listBuiltins(packageRoot),
    config: state.config,
  }
}

/**
 * The request as `for await` consumes it.
 *
 * The shared Host view declares the iterator method's result as an
 * `AsyncIterable`, while iteration needs the async *iterator* that method
 * returns; a Node request is both. This intersection states the second half
 * without touching the shared surface.
 */
type ReadableHttpRequest = HttpRequest & {
  [Symbol.asyncIterator](): AsyncIterator<Uint8Array | string>
}

/**
 * Read and parse a JSON request body.
 * @param req - incoming request.
 * @returns the parsed object.
 * @throws Error when the body is too large or not an object.
 */
async function readJsonBody(req: HttpRequest): Promise<Record<string, unknown>> {
  const chunks: Uint8Array[] = []
  let total = 0
  for await (const chunk of req as ReadableHttpRequest) {
    total += chunk.length
    if (total > MAX_BODY) throw new Error('request body too large')
    // The server's request iterator yields Buffers; the shared view also admits strings.
    chunks.push(chunk as Uint8Array)
  }
  if (chunks.length === 0) return {}
  const text = Buffer.concat(chunks).toString('utf8')
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('request body is not JSON')
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('request body must be an object')
  return value as Record<string, unknown>
}

/**
 * Validate a scope path segment.
 * @param value - raw segment.
 * @returns the scope.
 * @throws Error for anything else.
 */
function parseScope(value: string): RoleScope {
  if (value === 'global' || value === 'project') return value
  throw new Error(`unknown scope "${String(value)}"`)
}

/**
 * Write one JSON response.
 * @param res - server response.
 * @param status - HTTP status.
 * @param value - JSON value.
 */
function sendJson(res: HttpResponse, status: number, value: unknown): void {
  const body = JSON.stringify(value)
  // The server always provides `writeHead`; the shared view marks it optional.
  res.writeHead!(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

/** @param error - unknown thrown value. @returns its message. */
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
