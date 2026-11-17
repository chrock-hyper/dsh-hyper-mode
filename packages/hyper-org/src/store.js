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

import { acceptanceGate, occupiesSlot, parseOrder, SCHEMA_VERSION, serializeOrder } from './order-doc.js'

/** File name of the audit trail inside each scope directory. */
const CHANGELOG = 'CHANGELOG.md'

/**
 * Derive the order directories from the role scope resolution.
 *
 * Taking the role resolver's result is deliberate: one project root, one idea
 * of "the project", so an order can never land in a different project than the
 * roles it refers to.
 * @param resolved - output of the role plugin's `resolveDirs`.
 * @returns order directories, project half present only when a project exists.
 */
export function orgDirs(resolved) {
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
export function listOrders(dirs) {
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
export function readOrder(dirs, id) {
  for (const [scope, dir] of [['project', dirs.projectDir], ['global', dirs.globalDir]]) {
    if (dir === undefined) continue
    const path = join(dir, 'orders', `${id}.json`)
    if (!existsSync(path)) continue
    try {
      return { order: parseOrder(readFileSync(path, 'utf8')), scope, path }
    } catch (error) {
      throw new Error(`work order ${id} at ${path} cannot be read: ${error.message}`)
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
export function createOrder(dirs, input) {
  const scope = input.scope ?? (dirs.projectDir === undefined ? 'global' : 'project')
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
  appendChange(dir, `${id} created (${order.stage}, ${order.size}) by ${order.log[0].by}`)
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
export function saveOrder(dirs, input) {
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
export function signOrder(dirs, input) {
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
function requireOrder(dirs, id) {
  const found = readOrder(dirs, id)
  if (found === undefined) throw new Error(`工单 ${id} 不存在；用 org_board 的 action=list 查看现有工单`)
  return found
}

/**
 * @param found - a located order.
 * @returns its scope directory.
 */
function scopeDirOf(found) {
  return join(found.path, '..', '..')
}

/**
 * Read one scope directory.
 * @param dir - scope directory, when present.
 * @returns parsed orders and per-file problems.
 */
function readScope(dir) {
  if (dir === undefined) return { orders: [], problems: [] }
  const ordersDir = join(dir, 'orders')
  if (!existsSync(ordersDir)) return { orders: [], problems: [] }
  const orders = []
  const problems = []
  for (const name of readdirSync(ordersDir).sort()) {
    if (!name.endsWith('.json')) continue
    const path = join(ordersDir, name)
    try {
      orders.push(parseOrder(readFileSync(path, 'utf8')))
    } catch (error) {
      problems.push({ path, message: error.message })
    }
  }
  return { orders, problems }
}

/**
 * Today's next order id in one scope.
 * @param dir - scope directory.
 * @returns an unused id, e.g. `wo-20261115-3`.
 */
function nextId(dir) {
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
function requireDir(dirs, scope) {
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
function appendChange(dir, line) {
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
function writeText(path, text) {
  mkdirSync(join(path, '..'), { recursive: true })
  const temp = `${path}.tmp-${process.pid}`
  writeFileSync(temp, text, 'utf8')
  renameSync(temp, path)
}
