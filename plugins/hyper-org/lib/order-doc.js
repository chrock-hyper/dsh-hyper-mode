/**
 * The work-order document: one JSON file per unit of work, plus the rules that
 * decide which fields may change when.
 *
 * A work order is the only object in this company that outlives a session.
 * Sessions are hires, roles are positions, and the order is the job itself —
 * so its grammar is stricter than the role card's: every field here is read by
 * a tool that has to decide whether to refuse an action.
 *
 * Pure functions only: filesystem work lives in `store.js`.
 *
 * @module @chrock-studio/dsh-hyper-mode/hyper-org/order-doc
 */

/** Order ids look like `wo-20261115-1`. */
export const ORDER_ID = /^wo-[0-9]{8}-[0-9]{1,4}$/
/** Lifecycle stages, in the order a healthy order visits them. */
export const STAGES = ['intake', 'active', 'review', 'blocked', 'done', 'dropped']
/** Stages that occupy a work-in-progress slot. */
export const WIP_STAGES = ['active', 'review', 'blocked']
/** Sizes below this need acceptance criteria before they may go active. */
export const SIZED = ['M', 'L']
/** Sizes a caller may pick. */
export const SIZES = ['S', 'M', 'L']
/** Written into every file so a future version can migrate instead of guessing. */
export const SCHEMA_VERSION = 1

/**
 * Parse one stored order.
 * @param value - parsed JSON, or a JSON string.
 * @returns the normalized order.
 * @throws Error naming the first problem.
 */
export function parseOrder(value) {
  const raw = typeof value === 'string' ? JSON.parse(value) : value
  if (raw === null || typeof raw !== 'object') throw new Error('work order must be an object')
  if (raw.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`work order schemaVersion ${String(raw.schemaVersion)} is not ${SCHEMA_VERSION}`)
  }
  const id = String(raw.id ?? '')
  if (!ORDER_ID.test(id)) throw new Error(`invalid work order id "${id}"`)
  const title = String(raw.title ?? '').trim()
  if (title === '') throw new Error(`work order ${id} needs a title`)
  const stage = String(raw.stage ?? 'intake')
  if (!STAGES.includes(stage)) throw new Error(`work order ${id} has unknown stage "${stage}"`)
  const size = String(raw.size ?? 'M')
  if (!SIZES.includes(size)) throw new Error(`work order ${id} has unknown size "${size}"`)
  const dri = typeof raw.dri === 'string' && raw.dri.trim() !== '' ? raw.dri.trim() : undefined
  const log = Array.isArray(raw.log)
    ? raw.log
      .filter((entry) => entry !== null && typeof entry === 'object')
      .map((entry) => ({
        at: String(entry.at ?? ''),
        by: String(entry.by ?? ''),
        note: String(entry.note ?? ''),
      }))
      .filter((entry) => entry.note !== '')
    : []
  return {
    schemaVersion: SCHEMA_VERSION,
    id,
    title,
    stage,
    size,
    ...(dri === undefined ? {} : { dri }),
    acceptance: stringList(raw.acceptance),
    artifacts: stringList(raw.artifacts),
    log,
    createdAt: String(raw.createdAt ?? ''),
    updatedAt: String(raw.updatedAt ?? ''),
  }
}

/**
 * Serialize one order with a stable key order, so repeated saves diff cleanly.
 * @param order - normalized order.
 * @returns the file contents, newline-terminated.
 */
export function serializeOrder(order) {
  const normalized = parseOrder(order)
  return `${JSON.stringify(normalized, null, 2)}\n`
}

/**
 * Whether this order occupies a work-in-progress slot.
 * @param order - any order.
 * @returns true for active, review and blocked.
 */
export function occupiesSlot(order) {
  return WIP_STAGES.includes(order.stage)
}

/**
 * Whether this order may move to `active` without acceptance criteria.
 *
 * Small work is allowed to skip them; medium and large work is not, because
 * an order that cannot be judged cannot be signed, and an unsigned order is
 * just a conversation with extra steps.
 * @param order - the order being promoted.
 * @returns true when the gate is satisfied.
 */
export function acceptanceGate(order) {
  if (!SIZED.includes(order.size)) return true
  return order.acceptance.length > 0
}

/**
 * Normalize a list of short strings.
 * @param value - candidate list.
 * @returns trimmed, non-empty, de-duplicated strings.
 */
function stringList(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  const out = []
  for (const entry of value) {
    const text = String(entry ?? '').trim()
    if (text === '' || seen.has(text)) continue
    seen.add(text)
    out.push(text)
  }
  return out
}
