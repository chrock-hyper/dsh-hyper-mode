/**
 * The work-order document: one JSON file per unit of work, plus the rules that
 * decide which fields may change when.
 *
 * A work order is the only object in this company that outlives a session.
 * Sessions are hires, roles are positions, and the order is the job itself —
 * so its grammar is stricter than the role card's: every field here is read by
 * a tool that has to decide whether to refuse an action.
 *
 * Pure functions only: filesystem work lives in `store.ts`.
 *
 * @module @chrock-hyper/dsh-hyper-org/order-doc
 */

/** Order ids look like `wo-20261115-1`. */
export const ORDER_ID = /^wo-[0-9]{8}-[0-9]{1,4}$/
/** Lifecycle stages, in the order a healthy order visits them. */
export const STAGES = ['intake', 'active', 'review', 'blocked', 'done', 'dropped'] as const
/** Stages that occupy a work-in-progress slot. */
export const WIP_STAGES = ['active', 'review', 'blocked'] as const
/** Sizes below this need acceptance criteria before they may go active. */
export const SIZED = ['M', 'L'] as const
/** Sizes a caller may pick. */
export const SIZES = ['S', 'M', 'L'] as const
/** Written into every file so a future version can migrate instead of guessing. */
export const SCHEMA_VERSION = 1

/** One lifecycle stage, as stored and as compared. */
export type OrderStage = (typeof STAGES)[number]
/** One work-order size. */
export type OrderSize = (typeof SIZES)[number]

/** One audit-trail entry. */
export interface OrderLogEntry {
  at: string
  by: string
  note: string
}

/** One normalized work order, exactly as it is stored. */
export interface WorkOrder {
  schemaVersion: number
  id: string
  title: string
  stage: OrderStage
  size: OrderSize
  dri?: string
  acceptance: string[]
  artifacts: string[]
  log: OrderLogEntry[]
  createdAt: string
  updatedAt: string
}

/**
 * @param value - candidate stage from JSON.
 * @returns whether it names a known stage.
 */
export function isStage(value: unknown): value is OrderStage {
  return STAGES.some((stage) => stage === value)
}

/**
 * @param value - candidate size from JSON.
 * @returns whether it names a known size.
 */
export function isSize(value: unknown): value is OrderSize {
  return SIZES.some((size) => size === value)
}

/**
 * @param value - candidate object.
 * @returns whether it can be indexed; arrays pass on purpose, exactly as the
 *   original `typeof === 'object'` check did.
 */
function isObjectLike(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

/**
 * Parse one stored order.
 * @param value - parsed JSON, or a JSON string.
 * @returns the normalized order.
 * @throws Error naming the first problem.
 */
export function parseOrder(value: unknown): WorkOrder {
  const raw: unknown = typeof value === 'string' ? JSON.parse(value) : value
  if (!isObjectLike(raw)) throw new Error('work order must be an object')
  if (raw.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`work order schemaVersion ${String(raw.schemaVersion)} is not ${SCHEMA_VERSION}`)
  }
  const id = String(raw.id ?? '')
  if (!ORDER_ID.test(id)) throw new Error(`invalid work order id "${id}"`)
  const title = String(raw.title ?? '').trim()
  if (title === '') throw new Error(`work order ${id} needs a title`)
  const stage = String(raw.stage ?? 'intake')
  if (!isStage(stage)) throw new Error(`work order ${id} has unknown stage "${stage}"`)
  const size = String(raw.size ?? 'M')
  if (!isSize(size)) throw new Error(`work order ${id} has unknown size "${size}"`)
  const dri = typeof raw.dri === 'string' && raw.dri.trim() !== '' ? raw.dri.trim() : undefined
  const log: OrderLogEntry[] = Array.isArray(raw.log)
    ? raw.log
      .filter((entry): entry is Record<string, unknown> => isObjectLike(entry))
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
export function serializeOrder(order: WorkOrder): string {
  const normalized = parseOrder(order)
  return `${JSON.stringify(normalized, null, 2)}\n`
}

/**
 * Whether this order occupies a work-in-progress slot.
 * @param order - any order.
 * @returns true for active, review and blocked.
 */
export function occupiesSlot(order: Pick<WorkOrder, 'stage'>): boolean {
  return WIP_STAGES.some((stage) => stage === order.stage)
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
export function acceptanceGate(order: Pick<WorkOrder, 'size' | 'acceptance'>): boolean {
  if (!SIZED.some((size) => size === order.size)) return true
  return order.acceptance.length > 0
}

/**
 * Normalize a list of short strings.
 * @param value - candidate list.
 * @returns trimmed, non-empty, de-duplicated strings.
 */
function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const entry of value) {
    const text = String(entry ?? '').trim()
    if (text === '' || seen.has(text)) continue
    seen.add(text)
    out.push(text)
  }
  return out
}
