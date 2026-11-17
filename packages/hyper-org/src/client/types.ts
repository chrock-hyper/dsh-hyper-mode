/**
 * The payloads and panel-local state shapes the orders board renders.
 *
 * Every interface here mirrors JSON the Host half already assembles
 * (`src/api/handlers.ts`): the board summary from `GET /hyper-org/api/state`
 * and one order's card from `GET /hyper-org/api/order`. Nothing is read from a
 * file directly, so optional fields describe what a route may omit rather than
 * what it may type wrongly.
 */

/** The five board columns, in reading order; `done` is entered by sign only. */
export type BoardStage = 'intake' | 'active' | 'review' | 'blocked' | 'done'

/** Every lifecycle stage a stored order may carry; `dropped` is the folded one. */
export type OrderStage = BoardStage | 'dropped'

/** One work-order size. */
export type OrderSize = 'S' | 'M' | 'L'

/** The scope an order file lives in. */
export type OrderScope = 'project' | 'global'

/** One row of the board summary (`GET /state`). */
export interface OrderRow {
  id: string
  title: string
  stage: OrderStage
  size: OrderSize
  dri: string | null
  driTitle: string | null
  scope: OrderScope
  age: string
  updatedAt: string
  acceptanceCount: number
  artifactCount: number
  logCount: number
  occupiesSlot: boolean
}

/** One assignable role, as the board summary lists it. */
export interface RoleRow {
  id: string
  title: string
  scope: OrderScope
}

/** A board file the Host could not parse; reported, never thrown. */
export interface BoardProblem {
  path: string
  message: string
}

/** Who is acting, and whether signing is allowed to trust it. */
export interface ActorInfo {
  role: string | null
  label: string
  confirmed: boolean
}

/** The payload of `GET /hyper-org/api/state`. */
export interface BoardState {
  ok?: boolean
  now: string
  projectRoot: string | null
  globalDir: string
  projectDir: string | null
  wipLimit?: number
  actor?: ActorInfo
  stages?: string[]
  wipStages?: string[]
  sizes?: string[]
  occupied: number
  orders: OrderRow[]
  roles: RoleRow[]
  problems: BoardProblem[]
}

/** One audit-trail entry of a stored order. */
export interface OrderLogEntry {
  at: string
  by: string
  note: string
}

/** One stored work order, exactly as `GET /order` returns it. */
export interface OrderDocOrder {
  schemaVersion?: number
  id: string
  title: string
  stage: OrderStage
  size: OrderSize
  dri?: string
  acceptance: string[]
  artifacts: string[]
  log: OrderLogEntry[]
  createdAt?: string
  updatedAt: string
}

/** How one declared artifact resolved on disk. */
export type ArtifactKind = 'file' | 'dir' | 'missing' | 'escape'

/** One declared artifact, resolved by the Host's `describeArtifact`. */
export interface ArtifactEntry {
  path: string
  kind: ArtifactKind
  bytes?: number
  absolutePath?: string
}

/** One reason a sign-off or send-back is refused. */
export interface SignBlocker {
  code: string
  message: string
}

/** The payload of `GET /hyper-org/api/order`. */
export interface OrderDoc {
  ok?: boolean
  scope: OrderScope
  path: string
  order: OrderDocOrder
  driTitle?: string | null
  age: string
  artifacts: ArtifactEntry[]
  sign?: {
    allowed?: boolean
    blockers?: SignBlocker[]
  }
}

/** One board column, with its rows oldest first. */
export interface BoardColumnEntry {
  stage: BoardStage
  rows: OrderRow[]
}

/** The create form's values. */
export interface CreateForm {
  title: string
  size: string
  dri: string
  acceptance: string
  note: string
  scope: 'project' | 'global'
}

/** The detail form's values for one selected order. */
export interface EditForm {
  dri: string
  acceptance: string
  artifacts: string
  note: string
}

/** The drop-reason dialog's values, plus its own inline error. */
export interface DropState {
  id: string
  reason: string
  error: string
}
