/**
 * The order board's route table: the loopback guard, path parsing, and the
 * dispatch onto the state read and the order read/create/patch/sign calls.
 *
 * The panel is a static browser module, so it cannot call Host services; this
 * route is its one channel. Reads go straight to `store.js`; writes may only go
 * through `rules.*WithRules`, which is where the panel and the model tools meet
 * — so the panel can never hold a second opinion about who may sign what.
 *
 * Only loopback callers are served: the panel is an ordinary page fetch, so it
 * carries none of the connection carrier's credentials, and refusing every
 * non-local peer is the narrowest policy that still works from the page.
 *
 * @module @chrock-studio/dsh-hyper-org/api/routes
 */
import { readRole, resolveDirs } from '@chrock-studio/dsh-hyper-roles/internal'

import { ORDER_ID, occupiesSlot, SIZES, STAGES } from '../order-doc.js'
import {
  classify,
  createWithRules,
  explainCreate,
  signWithRules,
  updateWithRules,
} from '../rules.js'
import { listOrders, orgDirs, readOrder } from '../store.js'
import { orderPayload, statePayload } from './handlers.js'
import { isLoopback, message, readJsonBody, refusal, sendJson, sendMethod } from './http.js'

/** Route prefix owned by this plugin. */
export const API_PREFIX = '/hyper-org/api'

/**
 * Build the request handler.
 * @param options - DSH home, plugin config, and a session resolver returning the
 *   session's working directory and bound role.
 * @returns an HTTP handler for `ctx.webServer.register`.
 */
export function createApiHandler(options) {
  const { home, config, resolveSession } = options
  const wipLimit = config?.wipLimit

  return async function handler(req, res) {
    if (!isLoopback(req.socket?.remoteAddress)) {
      sendJson(res, 401, { ok: false, code: 'unauthorized', error: 'unauthorized' })
      return
    }

    let url
    try {
      url = new URL(req.url ?? '/', 'http://localhost')
    } catch {
      sendJson(res, 400, { ok: false, code: 'bad_url', error: '请求地址不合法' })
      return
    }
    const segments = url.pathname.split('/').filter((segment) => segment !== '')
    if (segments[0] !== 'hyper-org' || segments[1] !== 'api') {
      sendJson(res, 404, { ok: false, code: 'not_found', error: 'not found' })
      return
    }
    const rest = segments.slice(2)
    const method = String(req.method ?? 'GET').toUpperCase()

    const session = sessionInfo(resolveSession, url.searchParams.get('session'))
    const dirs = orgDirs(resolveDirs({ home, cwd: session.cwd }))
    const roleDirs = resolveDirs({ home, cwd: session.cwd })
    // The log label falls back to `lead`; the self-sign check uses the real
    // binding, which stays undefined for an unbound session.
    const actor = session.role ?? 'lead'

    try {
      if (rest[0] === 'state') {
        if (method !== 'GET' || rest.length !== 1) {
          sendMethod(res, method, 'GET', rest.length === 1)
          return
        }
        sendJson(res, 200, statePayload({ dirs, roleDirs, session, actor, wipLimit }))
        return
      }

      if (rest[0] === 'order') {
        if (rest.length === 1 && method === 'GET') {
          const id = requireOrderId(res, url.searchParams.get('id'))
          if (id === undefined) return
          const found = readOrder(dirs, id)
          if (found === undefined) {
            sendJson(res, 404, { ok: false, code: 'order_not_found', error: missingOrder(id) })
            return
          }
          sendJson(res, 200, orderPayload(found, { dirs, roleDirs, role: session.role }))
          return
        }

        // Create. The stage is never taken from the body: `createOrder` decides
        // it from the slot budget and the acceptance gate, and a downgrade is a
        // 200 with an explanation, not a failure.
        if (rest.length === 1 && method === 'POST') {
          const body = await readJsonBody(req)
          if (body.scope !== undefined && body.scope !== 'project' && body.scope !== 'global') {
            throw refusal(400, 'bad_scope', `未知作用域 "${String(body.scope)}"；可用 project / global`)
          }
          if (body.size !== undefined && !SIZES.includes(body.size)) {
            throw refusal(400, 'bad_size', `未知规模 "${String(body.size)}"；可用 ${SIZES.join(' / ')}`)
          }
          const created = createWithRules(dirs, {
            scope: body.scope,
            title: body.title,
            size: body.size,
            dri: body.dri,
            acceptance: body.acceptance,
            note: body.note,
            by: actor,
          }, { lookupRole: (id) => readRole(roleDirs, id), wipLimit })
          const found = readOrder(dirs, created.order.id)
          sendJson(res, 200, {
            ...orderPayload(found, { dirs, roleDirs, role: session.role }),
            downgraded: created.downgraded,
            reason: created.reason ?? null,
            occupied: listOrders(dirs).merged.filter(occupiesSlot).length,
            wipLimit,
            notes: explainCreate(created),
          })
          return
        }

        if (rest.length === 2 && method === 'PATCH') {
          const id = requirePathId(res, rest[1])
          if (id === undefined) return
          const body = await readJsonBody(req)
          if (body.stage !== undefined && !STAGES.includes(body.stage)) {
            throw refusal(400, 'bad_stage', `未知阶段 "${String(body.stage)}"；可用 ${STAGES.join(' / ')}`)
          }
          if (body.size !== undefined && !SIZES.includes(body.size)) {
            throw refusal(400, 'bad_size', `未知规模 "${String(body.size)}"；可用 ${SIZES.join(' / ')}`)
          }
          const saved = updateWithRules(dirs, {
            id,
            by: actor,
            patch: {
              ...(body.stage === undefined ? {} : { stage: body.stage }),
              ...(body.title === undefined ? {} : { title: body.title }),
              ...(body.size === undefined ? {} : { size: body.size }),
              ...(body.dri === undefined ? {} : { dri: body.dri }),
              ...(body.acceptance === undefined ? {} : { acceptance: body.acceptance }),
              ...(body.artifacts === undefined ? {} : { artifacts: body.artifacts }),
              ...(body.note === undefined ? {} : { note: body.note }),
            },
          }, { lookupRole: (id) => readRole(roleDirs, id) })
          sendJson(res, 200, orderPayload(readOrder(dirs, saved.id), { dirs, roleDirs, role: session.role }))
          return
        }

        if (rest.length === 3 && rest[2] === 'sign' && method === 'POST') {
          const id = requirePathId(res, rest[1])
          if (id === undefined) return
          const body = await readJsonBody(req)
          if (typeof body.approve !== 'boolean') {
            throw refusal(400, 'bad_body', 'approve 需要 true（签收）或 false（打回）')
          }
          const signed = signWithRules(dirs, {
            id,
            approve: body.approve,
            // A sign request always asks for a note; a missing one is empty,
            // which `note_required` refuses — never "not asked yet".
            note: body.note ?? '',
            by: actor,
            role: session.role,
          })
          sendJson(res, 200, orderPayload(readOrder(dirs, signed.id), { dirs, roleDirs, role: session.role }))
          return
        }

        if (rest.length === 1) {
          sendMethod(res, method, 'GET, POST', true)
          return
        }
        if (rest.length === 2) {
          sendMethod(res, method, 'PATCH', true)
          return
        }
        if (rest.length === 3 && rest[2] === 'sign') {
          sendMethod(res, method, 'POST', true)
          return
        }
        sendJson(res, 404, { ok: false, code: 'not_found', error: 'not found' })
        return
      }

      // There is no artifact route on purpose: deliverables are opened by DSH's
      // own right sidebar, so the panel never reads file contents.
      sendJson(res, 404, { ok: false, code: 'not_found', error: 'not found' })
    } catch (error) {
      respondError(res, error)
    }
  }
}

/**
 * Resolve one session's working directory and identity.
 * @param resolver - the mounting plugin's session resolver, when available.
 * @param sessionId - query value.
 * @returns `{ cwd, role, confirmed }`; `confirmed` is false when no live
 *   session could be read, which the panel surfaces as "cannot confirm identity".
 */
function sessionInfo(resolver, sessionId) {
  if (typeof sessionId !== 'string' || sessionId === '') return { cwd: undefined, role: undefined, confirmed: false }
  let value
  try {
    value = typeof resolver === 'function' ? resolver(sessionId) : undefined
  } catch {
    value = undefined
  }
  if (value === undefined || value === null) return { cwd: undefined, role: undefined, confirmed: false }
  return {
    cwd: typeof value.cwd === 'string' && value.cwd !== '' ? value.cwd : undefined,
    role: typeof value.role === 'string' && value.role !== '' ? value.role : undefined,
    confirmed: true,
  }
}

/**
 * Validate the `id` query value before it can reach the filesystem.
 * @param res - response, used to answer immediately.
 * @param value - raw query value.
 * @returns the id, or undefined after a 400 was sent.
 */
function requireOrderId(res, value) {
  const id = typeof value === 'string' ? value.trim() : ''
  if (!ORDER_ID.test(id)) {
    sendJson(res, 400, { ok: false, code: 'bad_id', error: `工单 id 不合法：${String(value ?? '')}` })
    return undefined
  }
  return id
}

/** @param id - order id. @returns the store's not-found sentence. */
function missingOrder(id) {
  return `工单 ${id} 不存在；用 org_board 的 action=list 查看现有工单`
}

/**
 * Validate an id taken from a path segment.
 * @param res - response, used to answer immediately.
 * @param value - raw segment.
 * @returns the id, or undefined after a 400 was sent.
 */
function requirePathId(res, value) {
  const id = typeof value === 'string' ? value.trim() : ''
  if (!ORDER_ID.test(id)) {
    sendJson(res, 400, { ok: false, code: 'bad_id', error: `工单 id 不合法：${String(value ?? '')}` })
    return undefined
  }
  return id
}

/**
 * Turn any thrown value into the documented HTTP answer.
 * @param res - response.
 * @param error - unknown thrown value.
 */
function respondError(res, error) {
  if (typeof error?.status === 'number' && typeof error?.code === 'string') {
    sendJson(res, error.status, { ok: false, code: error.code, error: message(error) })
    return
  }
  const { status, code } = classify(error)
  sendJson(res, status, { ok: false, code, error: message(error) })
}
