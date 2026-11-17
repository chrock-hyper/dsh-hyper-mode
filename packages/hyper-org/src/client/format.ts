/**
 * The panel's pure view helpers: board grouping, aging, labels and forms.
 *
 * Everything here is a function of the payload, which is why the client test
 * reaches them through `__test`: a stage column, an overdue marker or a log
 * timestamp can be checked without mounting the board.
 */
import type { BoardColumnEntry, BoardStage, CreateForm, EditForm, OrderDocOrder, OrderRow, OrderStage } from './types.ts'

/** The five columns, in reading order; `done` is entered by sign only. */
export const BOARD_STAGES: BoardStage[] = ['intake', 'active', 'review', 'blocked', 'done']

/** Stages a human may pick in the stage menu; `done` only comes from sign. */
export const WRITABLE_STAGES: OrderStage[] = ['intake', 'active', 'review', 'blocked', 'dropped']

/** Log entries rendered before the "show all" link appears. */
export const LOG_SHOWN = 100

/** A review card is "overdue" past this many hours; a display threshold only. */
export const OVERDUE_HOURS = 72

/** @param iso - ISO timestamp. @returns `MM-DD HH:mm`, as the log shows it. */
export function formatLogTime(iso: string | null | undefined): string {
  const text = String(iso || '')
  if (text.length < 16) return text === '' ? '—' : text
  return `${text.slice(5, 10)} ${text.slice(11, 16)}`
}

/** @param kind - artifact status from the Host. @returns its locale key. */
export function kindKey(kind: string | undefined): string {
  if (kind === 'file') return 'artifactFile'
  if (kind === 'dir') return 'artifactDir'
  if (kind === 'escape') return 'artifactEscape'
  return 'artifactMissing'
}

/** @param stage - stage id. @returns its locale key. */
export function stageKey(stage: string | undefined): string {
  const text = String(stage || '')
  return `stage${text.charAt(0).toUpperCase()}${text.slice(1)}`
}

/** @param stage - stage id. @returns its one-line meaning key. */
export function stageSubKey(stage: string | undefined): string {
  return `${stageKey(stage)}Sub`
}

/**
 * Hours between an ISO timestamp and the board's `now`.
 * @param iso - updatedAt.
 * @param now - board timestamp.
 * @returns hours, 0 when either value is unusable.
 */
export function hoursSince(iso: string | null | undefined, now: string | null | undefined): number {
  const from = Date.parse(String(iso || ''))
  const to = Date.parse(String(now || ''))
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 0
  return (to - from) / 3_600_000
}

/** @param rows - board rows, oldest first. */
export function sortOldestFirst(rows: OrderRow[]): OrderRow[] {
  return rows.slice().sort((left, right) => String(left.updatedAt).localeCompare(String(right.updatedAt)))
}

/**
 * The five columns, in the Host's stage order.
 * @param orders - board rows.
 * @returns one entry per column, rows oldest first.
 */
export function columnsOf(orders: OrderRow[] | null | undefined): BoardColumnEntry[] {
  const list = Array.isArray(orders) ? orders : []
  return BOARD_STAGES.map((stage) => ({
    stage,
    rows: sortOldestFirst(list.filter((row) => row.stage === stage)),
  }))
}

/**
 * The folded bottom strip: cancelled orders stay visible, never deleted.
 * @param orders - board rows.
 * @returns dropped rows, oldest first.
 */
export function archiveOf(orders: OrderRow[] | null | undefined): OrderRow[] {
  return sortOldestFirst((Array.isArray(orders) ? orders : []).filter((row) => row.stage === 'dropped'))
}

/**
 * Review cards aging past the threshold. A display marker, not a gate: the
 * Host has no "overdue" rule and nothing here refuses anything.
 * @param orders - board rows.
 * @param now - board timestamp.
 * @returns overdue review rows.
 */
export function overdueOf(orders: OrderRow[] | null | undefined, now: string | null | undefined): OrderRow[] {
  return (Array.isArray(orders) ? orders : [])
    .filter((row) => row.stage === 'review' && hoursSince(row.updatedAt, now) >= OVERDUE_HOURS)
}

/**
 * Medium and large orders with no acceptance criteria — the ones a board
 * reader should fix before trying to promote them.
 * @param orders - board rows.
 * @returns rows that would be refused for missing criteria.
 */
export function noAcceptanceOf(orders: OrderRow[] | null | undefined): OrderRow[] {
  return (Array.isArray(orders) ? orders : []).filter((row) => (row.size === 'M' || row.size === 'L')
    && row.stage !== 'done'
    && row.stage !== 'dropped'
    && Number(row.acceptanceCount) === 0)
}

/**
 * The row an operator should look at first: work waiting on a decision, then
 * work in flight, then the queue.
 * @param orders - board rows.
 * @returns an order id, or null when the board is empty.
 */
export function pickFirst(orders: OrderRow[] | null | undefined): string | null {
  const list = Array.isArray(orders) ? orders : []
  for (const stage of ['review', 'blocked', 'active', 'intake'] as const) {
    const found = list.find((row) => row.stage === stage)
    if (found !== undefined) return found.id
  }
  return list.length > 0 ? list[0]?.id ?? null : null
}

/** @returns the create form's initial values. */
export function emptyCreate(): CreateForm {
  return { title: '', size: 'M', dri: '', acceptance: '', note: '', scope: 'project' }
}

/** @param order - normalized order. @returns edit-form values. */
export function editFrom(order: OrderDocOrder): EditForm {
  return {
    dri: order.dri === undefined ? '' : order.dri,
    acceptance: (order.acceptance || []).join('\n'),
    artifacts: '',
    note: '',
  }
}

/**
 * The sentence a failure shows: an Error's message, else the value itself.
 * @param failure - a thrown value.
 * @returns human-readable text.
 */
export function messageOf(failure: unknown): string {
  if (failure !== null && typeof failure === 'object' && 'message' in failure) {
    const message = (failure as { message?: unknown }).message
    if (message !== undefined && message !== null && message !== '') return String(message)
  }
  return String(failure)
}
