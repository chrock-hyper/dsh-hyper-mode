/**
 * Where work orders live, and the only place that mutates them.
 *
 * Scope rule mirrors the role store: a project scope belongs to one project
 * root (`<project>/.dsh/org`), the global scope is shared by the profile
 * (`<home>/org`), and a project order shadows a global one with the same id.
 *
 * @module @chrock-studio/dsh-hyper-org/store
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { OrderSize, OrderStage, WorkOrder } from './order-doc.ts'
import { acceptanceGate, occupiesSlot, parseOrder, SCHEMA_VERSION, serializeOrder } from './order-doc.ts'

/** File name of the audit trail inside each scope directory. */
const CHANGELOG = 'CHANGELOG.md'

/** The two scopes an order can live in. */
export type OrderScope = 'global' | 'project'

/**
 * The role plugin's scope directories, as its `resolveDirs` returns them.
 *
 * Declared here rather than imported: `hyper-roles/internal` does not export
 * its types, and this package only needs the four directories.
 */
export interface ScopeDirs {
  home: string
  globalDir: string
  projectRoot: string | undefined
  projectDir: string | undefined
}

/** Where this plugin's order files live, derived from the role scopes. */
export interface OrgDirs {
  home: string
  globalDir: string
  projectRoot: string | undefined
  projectDir: string | undefined
}

/** A work-order file that failed to parse, reported instead of thrown. */
export interface OrderProblem {
  path: string
  message: string
}

/** Both scopes, with the shadowing already applied. */
export interface OrderListing {
  project: WorkOrder[]
  global: WorkOrder[]
  merged: WorkOrder[]
  problems: OrderProblem[]
}

/** One order plus where it was read from. */
export interface LocatedOrder {
  order: WorkOrder
  scope: OrderScope
  path: string
}

/** A create request: identity, content and the caller's slot budget. */
export interface CreateOrderInput {
  scope?: OrderScope
  title: string
  stage?: OrderStage
  size?: OrderSize
  dri?: string
  acceptance?: string[]
  note?: string
  by?: string
  wipLimit: number
}

/** A create result: what was asked for, what happened, and why. */
export interface CreateOrderResult {
  order: WorkOrder
  requested: OrderStage
  downgraded: boolean
  reason: 'wip' | 'acceptance' | undefined
  occupied: number
  wipLimit: number
}

/** The fields a patch may change; every one is optional. */
export interface OrderPatch {
  stage?: OrderStage
  title?: string
  size?: OrderSize
  dri?: string
  acceptance?: string[]
  artifacts?: string[]
  note?: string
}

/** A patch request: the order to change, the patch, and the log label. */
export interface SaveOrderInput {
  id: string
  patch: OrderPatch
  by?: string
}

/** A sign request: approval, signer and note. */
export interface SignOrderInput {
  id: string
  approved: boolean
  by?: string
  note?: string
}

/** @param error - unknown thrown value. @returns its message. */
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * Derive the order directories from the role scope resolution.
 *
 * Taking the role resolver's result is deliberate: one project root, one idea
 * of "the project", so an order can never land in a different project than the
 * roles it refers to.
 * @param resolved - output of the role plugin's `resolveDirs`.
 * @returns order directories, project half present only when a project exists.
 */
export function orgDirs(resolved: ScopeDirs): OrgDirs {
  const home = resolved.home
  const projectRoot = resolved.projectRoot
  return {
    home,
    globalDir: join(home, 'org'),
    projectRoot,
    projectDir: projectRoot === undefined ? undefined : join(projectRoot, '.dsh', 'org'),
  }
}

/**
 * Read every order in both scopes.
 * @param dirs - order directories.
 * @returns project rows, global rows, the shadowing merge, and unreadable files.
 */
export function listOrders(dirs: OrgDirs): OrderListing {
  const project = readScope(dirs.projectDir)
  const global = readScope(dirs.globalDir)
  const shadowed = new Set(project.orders.map((order) => order.id))
  const merged = [...project.orders, ...global.orders.filter((order) => !shadowed.has(order.id))]
  return {
    project: project.orders,
    global: global.orders,
    merged,
    problems: [...project.problems, ...global.problems],
  }
}

/**
 * Read one order, preferring the project copy.
 * @param dirs - order directories.
 * @param id - order id.
 * @returns the order plus where it was read from, or undefined.
 */
export function readOrder(dirs: OrgDirs, id: string): LocatedOrder | undefined {
  const scopes: Array<[OrderScope, string | undefined]> = [
    ['project', dirs.projectDir],
    ['global', dirs.globalDir],
  ]
  for (const [scope, dir] of scopes) {
    if (dir === undefined) continue
    const path = join(dir, 'orders', `${id}.json`)
    if (!existsSync(path)) continue
    try {
      return { order: parseOrder(readFileSync(path, 'utf8')), scope, path }
    } catch (error) {
      throw new Error(`work order ${id} at ${path} cannot be read: ${errorText(error)}`)
    }
  }
  return undefined
}

/**
 * Create one order.
 *
 * The stage is not taken on faith: when every slot is taken, a new order lands
 * in `intake` no matter what was asked for, because a company that cannot queue
 * is a company that cannot say no.
 * @param dirs - order directories.
 * @param input - identity, content and the caller's slot budget.
 * @returns the created order, the requested stage and whether it was downgraded.
 */
export function createOrder(dirs: OrgDirs, input: CreateOrderInput): CreateOrderResult {
  const requestedScope = input.scope ?? (dirs.projectDir === undefined ? 'global' : 'project')
  // Any non-`project` value resolves to the global directory, as it always has.
  const scope: OrderScope = requestedScope === 'project' ? 'project' : 'global'
  const dir = requireDir(dirs, scope)
  const id = nextId(dir)
  const now = new Date().toISOString()
  const requested = input.stage ?? 'active'
  const occupied = listOrders(dirs).merged.filter(occupiesSlot).length
  const draft = {
    acceptance: input.acceptance ?? [],
    size: input.size ?? 'M',
  }
  const overBudget = requested !== 'intake' && occupied >= input.wipLimit
  const unjudgeable = requested !== 'intake' && !acceptanceGate(draft)
  const downgraded = overBudget || unjudgeable
  const order = parseOrder({
    schemaVersion: SCHEMA_VERSION,
    id,
    title: input.title,
    stage: downgraded ? 'intake' : requested,
    size: input.size ?? 'M',
    ...(input.dri === undefined ? {} : { dri: input.dri }),
    acceptance: input.acceptance ?? [],
    artifacts: [],
    log: [{ at: now, by: input.by ?? 'lead', note: input.note ?? '建单' }],
    createdAt: now,
    updatedAt: now,
  })
  writeText(join(dir, 'orders', `${id}.json`), serializeOrder(order))
  // An empty note is filtered out by `parseOrder`, so an empty log would fail
  // here exactly as it did before this file was typed.
  appendChange(dir, `${id} created (${order.stage}, ${order.size}) by ${order.log[0]!.by}`)
  const reason = overBudget ? 'wip' : unjudgeable ? 'acceptance' : undefined
  return { order, requested, downgraded, reason, occupied, wipLimit: input.wipLimit }
}

/**
 * Patch one order. Workflow rules live here so every writer obeys them.
 * @param dirs - order directories.
 * @param input - id, patch, actor and slot budget.
 * @returns the saved order.
 * @throws Error when the transition is not allowed.
 */
export function saveOrder(dirs: OrgDirs, input: SaveOrderInput): WorkOrder {
  const found = requireOrder(dirs, input.id)
  const now = new Date().toISOString()
  const patch = input.patch ?? {}
  const next = { ...found.order }

  if (patch.stage !== undefined) {
    if (patch.stage === 'done') {
      throw new Error(`工单 ${input.id} 不能直接置为 done：先置 review，再由非领取人用 sign 签收`)
    }
    if (patch.stage === 'dropped' && typeof patch.note !== 'string') {
      throw new Error(`撤单要写理由：给 note`)
    }
    next.stage = patch.stage
  }
  if (patch.title !== undefined) next.title = patch.title
  if (patch.size !== undefined) next.size = patch.size
  if (patch.dri !== undefined) next.dri = patch.dri === '' ? undefined : patch.dri
  if (patch.acceptance !== undefined) next.acceptance = patch.acceptance
  if (patch.stage === 'active' && !acceptanceGate(next)) {
    throw new Error(`工单 ${input.id} 是 ${next.size} 规模，没有验收标准不能进 active：先补 acceptance`)
  }
  if (patch.artifacts !== undefined) next.artifacts = [...new Set([...next.artifacts, ...patch.artifacts])]

  const note = typeof patch.note === 'string' && patch.note !== '' ? patch.note : undefined
  const changed = next.stage !== found.order.stage ? `stage ${found.order.stage} → ${next.stage}` : 'updated'
  const entry = note === undefined ? changed : `${changed}: ${note}`
  next.log = [...next.log, { at: now, by: input.by ?? 'lead', note: entry }]
  next.updatedAt = now

  const saved = parseOrder(next)
  writeText(found.path, serializeOrder(saved))
  appendChange(scopeDirOf(found), `${saved.id} ${entry} by ${input.by ?? 'lead'}`)
  return saved
}

/**
 * Sign an order off, or send it back.
 *
 * Only `review` orders can be signed, and the signer is recorded. The tool
 * layer additionally refuses a signer who is the order's own DRI.
 * @param dirs - order directories.
 * @param input - id, approval, signer, note.
 * @returns the signed order.
 */
export function signOrder(dirs: OrgDirs, input: SignOrderInput): WorkOrder {
  const found = requireOrder(dirs, input.id)
  if (found.order.stage !== 'review') {
    throw new Error(`工单 ${input.id} 现在是 ${found.order.stage}，只有 review 状态可以签收；先 update 到 review`)
  }
  if (input.approved === true && found.order.acceptance.length === 0) {
    throw new Error(`工单 ${input.id} 没有验收标准，签字等于自欺：先 update 补上 acceptance`)
  }
  const now = new Date().toISOString()
  const entry = input.approved
    ? `signed off${input.note === undefined ? '' : `: ${input.note}`}`
    : `sent back${input.note === undefined ? '' : `: ${input.note}`}`
  const next = parseOrder({
    ...found.order,
    stage: input.approved ? 'done' : 'active',
    log: [...found.order.log, { at: now, by: input.by ?? 'lead', note: entry }],
    updatedAt: now,
  })
  writeText(found.path, serializeOrder(next))
  appendChange(scopeDirOf(found), `${next.id} ${entry} by ${input.by ?? 'lead'}`)
  return next
}

/**
 * Look up one order or fail loudly.
 * @param dirs - order directories.
 * @param id - order id.
 * @returns the found record.
 */
function requireOrder(dirs: OrgDirs, id: string): LocatedOrder {
  const found = readOrder(dirs, id)
  if (found === undefined) throw new Error(`工单 ${id} 不存在；用 org_board 的 action=list 查看现有工单`)
  return found
}

/**
 * @param found - a located order.
 * @returns its scope directory.
 */
function scopeDirOf(found: LocatedOrder): string {
  return join(found.path, '..', '..')
}

/**
 * Read one scope directory.
 * @param dir - scope directory, when present.
 * @returns parsed orders and per-file problems.
 */
function readScope(dir: string | undefined): { orders: WorkOrder[]; problems: OrderProblem[] } {
  if (dir === undefined) return { orders: [], problems: [] }
  const ordersDir = join(dir, 'orders')
  if (!existsSync(ordersDir)) return { orders: [], problems: [] }
  const orders: WorkOrder[] = []
  const problems: OrderProblem[] = []
  for (const name of readdirSync(ordersDir).sort()) {
    if (!name.endsWith('.json')) continue
    const path = join(ordersDir, name)
    try {
      orders.push(parseOrder(readFileSync(path, 'utf8')))
    } catch (error) {
      problems.push({ path, message: errorText(error) })
    }
  }
  return { orders, problems }
}

/**
 * Today's next order id in one scope.
 * @param dir - scope directory.
 * @returns an unused id, e.g. `wo-20261115-3`.
 */
function nextId(dir: string): string {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll('-', '')
  const ordersDir = join(dir, 'orders')
  const taken = new Set(existsSync(ordersDir) ? readdirSync(ordersDir) : [])
  for (let index = 1; index < 10_000; index += 1) {
    const id = `wo-${stamp}-${index}`
    if (!taken.has(`${id}.json`)) return id
  }
  throw new Error('no free work order id for today')
}

/**
 * Resolve one scope directory or explain why it is unavailable.
 * @param dirs - order directories.
 * @param scope - requested scope.
 * @returns the directory.
 */
function requireDir(dirs: OrgDirs, scope: OrderScope): string {
  const dir = scope === 'project' ? dirs.projectDir : dirs.globalDir
  if (dir === undefined) throw new Error('这个会话没有项目根，只能写全局作用域')
  mkdirSync(join(dir, 'orders'), { recursive: true })
  return dir
}

/**
 * Append one line to a scope's audit trail.
 * @param dir - scope directory.
 * @param line - what happened.
 */
function appendChange(dir: string, line: string): void {
  const path = join(dir, CHANGELOG)
  const stamp = new Date().toISOString()
  const before = existsSync(path) ? readFileSync(path, 'utf8') : '# Work orders\n\n'
  writeText(path, `${before}${stamp}  ${line}\n`)
}

/**
 * Write a file through a temporary sibling and a rename.
 * @param path - destination.
 * @param text - contents.
 */
function writeText(path: string, text: string): void {
  mkdirSync(join(path, '..'), { recursive: true })
  const temp = `${path}.tmp-${process.pid}`
  writeFileSync(temp, text, 'utf8')
  renameSync(temp, path)
}
