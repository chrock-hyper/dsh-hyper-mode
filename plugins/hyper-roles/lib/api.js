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
 * @module @chrock-studio/dsh-hyper-mode/hyper-roles/api
 */
import { recentProjects, resolveDirs, saveConfig } from './scopes.js'
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
} from './store.js'

/** Route prefix owned by this plugin. */
export const API_PREFIX = '/hyper-roles'
/** Largest accepted JSON body; a role card is small by nature. */
const MAX_BODY = 256 * 1024

/**
 * Build the request handler.
 * @param options - mounting context, shared state, DSH home and bundle root.
 * @returns an HTTP handler for `ctx.webServer.register`.
 */
export function createApiHandler(options) {
  const { ctx, state, home, bundleRoot } = options

  return async function handler(req, res) {
    const rejection = guard(ctx, req)
    if (rejection !== undefined) {
      sendJson(res, rejection, { ok: false, error: rejection === 401 ? 'unauthorized' : 'forbidden' })
      return
    }

    let url
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
    const dirs = resolveDirs({ home, cwd: url.searchParams.get('cwd') ?? undefined })

    try {
      if (req.method === 'GET' && rest.length === 1 && rest[0] === 'state') {
        sendJson(res, 200, statePayload({ home, dirs, state, bundleRoot }))
        return
      }

      if (req.method === 'GET' && rest.length === 3 && rest[0] === 'role') {
        const scope = parseScope(rest[1])
        const card = readRoleIn(dirs, scope, rest[2])
        if (card === undefined) {
          sendJson(res, 404, { ok: false, error: `role "${rest[2]}" not found in ${scope} scope` })
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
        const scope = parseScope(rest[1])
        const body = await readJsonBody(req)
        if (body.fromBuiltin !== undefined) {
          const card = copyBuiltin(bundleRoot, dirs, { id: String(body.fromBuiltin), scope })
          sendJson(res, 200, { ok: true, id: card.fields.id, revision: card.fields.version })
          return
        }
        const card = createRole(dirs, {
          scope,
          id: String(body.id ?? ''),
          title: body.title,
          body: body.body,
          fields: body.fields ?? {},
        })
        sendJson(res, 200, { ok: true, id: card.fields.id, revision: card.fields.version })
        return
      }

      if (req.method === 'PUT' && rest.length === 3 && rest[0] === 'role') {
        const scope = parseScope(rest[1])
        const body = await readJsonBody(req)
        const card = saveRole(dirs, {
          scope,
          id: rest[2],
          fields: body.fields ?? {},
          body: typeof body.body === 'string' ? body.body : undefined,
          expectedVersion: typeof body.expectedVersion === 'number' ? body.expectedVersion : undefined,
          actor: 'panel',
        })
        sendJson(res, 200, { ok: true, id: card.fields.id, revision: card.fields.version })
        return
      }

      if (req.method === 'POST' && rest.length === 4 && rest[0] === 'role' && rest[3] === 'archive') {
        const target = archiveRole(dirs, { scope: parseScope(rest[1]), id: rest[2] })
        sendJson(res, 200, { ok: true, archivedTo: target })
        return
      }

      if (req.method === 'POST' && rest.length === 4 && rest[0] === 'role' && rest[3] === 'note') {
        const body = await readJsonBody(req)
        const entry = appendNote(dirs, {
          scope: parseScope(rest[1]),
          id: rest[2],
          text: body.text,
          source: 'panel',
        })
        sendJson(res, 200, { ok: true, entry })
        return
      }

      if (req.method === 'PUT' && rest.length === 4 && rest[0] === 'role' && rest[3] === 'guide') {
        const body = await readJsonBody(req)
        const path = writeGuide(dirs, { scope: parseScope(rest[1]), id: rest[2], text: String(body.text ?? '') })
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
      if (error?.code === 'stale') {
        sendJson(res, 409, { ok: false, code: 'stale', currentVersion: error.currentVersion, error: message(error) })
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
 * Decide whether a request may proceed.
 *
 * With the connection carrier present its own check owns the answer. Without
 * it (CLI or a test harness) the route only serves loopback callers, which is
 * the narrowest useful policy rather than an open port.
 * @param ctx - mounting context.
 * @param req - incoming request.
 * @returns 401 or 403 when refused, undefined when allowed.
 */
function guard(ctx, req) {
  let connection
  try {
    connection = ctx.get('connection')
  } catch {
    connection = undefined
  }
  if (connection !== undefined && typeof connection.requestRejection === 'function') {
    return connection.requestRejection(req)
  }
  return isLoopback(req.socket?.remoteAddress) ? undefined : 403
}

/**
 * True for loopback peer addresses, including IPv4-mapped IPv6.
 * @param address - socket remote address.
 * @returns whether the address is local.
 */
function isLoopback(address) {
  if (typeof address !== 'string' || address === '') return false
  if (address === '::1' || address === '127.0.0.1' || address.startsWith('127.')) return true
  return address === '::ffff:127.0.0.1'
}

/**
 * Assemble the panel's initial state.
 * @param options - home, resolved dirs, shared state and bundle root.
 * @returns the JSON payload.
 */
function statePayload(options) {
  const { home, dirs, state, bundleRoot } = options
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
    builtins: listBuiltins(bundleRoot),
    config: state.config,
  }
}

/**
 * Read and parse a JSON request body.
 * @param req - incoming request.
 * @returns the parsed object.
 * @throws Error when the body is too large or not an object.
 */
async function readJsonBody(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > MAX_BODY) throw new Error('request body too large')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  const text = Buffer.concat(chunks).toString('utf8')
  let value
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('request body is not JSON')
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('request body must be an object')
  return value
}

/**
 * Validate a scope path segment.
 * @param value - raw segment.
 * @returns the scope.
 * @throws Error for anything else.
 */
function parseScope(value) {
  if (value === 'global' || value === 'project') return value
  throw new Error(`unknown scope "${String(value)}"`)
}

/**
 * Write one JSON response.
 * @param res - server response.
 * @param status - HTTP status.
 * @param value - JSON value.
 */
function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(body)
}

/** @param error - unknown thrown value. @returns its message. */
function message(error) {
  return error instanceof Error ? error.message : String(error)
}
