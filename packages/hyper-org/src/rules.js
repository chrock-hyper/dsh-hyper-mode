/**
 * The company's rules, in one place: text parsing, the sign-off checks, the DRI
 * check, the human explanation of a downgraded create, and the one sequence
 * every writer follows — validate, then call `store.js`.
 *
 * Two writers exist: the model tools (`lib/tools.js`) and the panel's HTTP
 * surface (`lib/api.js`). They meet here so a rule can never be enforced twice
 * with two different answers; `store.js` keeps the stage, acceptance and
 * work-in-progress gates and is not bypassed.
 *
 * Pure functions and store calls only: no filesystem, no HTTP, no Cordis.
 *
 * @module @chrock-studio/dsh-hyper-org/rules
 */
import { createOrder, readOrder, saveOrder, signOrder } from './store.js'

/**
 * Split a newline-separated argument into items.
 *
 * Acceptance criteria are prose: "无构建、无网络，断网可玩" is ONE criterion,
 * so the Chinese comma must not split it. Only a line break starts a new one.
 * @param value - raw argument.
 * @returns trimmed, non-empty lines.
 */
export function splitLines(value) {
  if (typeof value !== 'string') return []
  return value
    .split(/\n/)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
}

/**
 * Split a comma- or newline-separated argument into items.
 * @param value - raw argument.
 * @returns trimmed, non-empty items.
 */
export function splitList(value) {
  if (typeof value !== 'string') return []
  return value
    .split(/[,，\n]/)
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '')
}

/**
 * Assert that a DRI names a role the company actually has.
 * @param lookupRole - reads one role card by id, project scope first.
 * @param id - role id from the order.
 * @returns the role card.
 * @throws Error naming where to look instead.
 */
export function requireRoleId(lookupRole, id) {
  const card = typeof lookupRole === 'function' ? lookupRole(id) : undefined
  if (card === undefined) {
    throw new Error(`岗位 "${id}" 不存在；先建岗位，或用 role action=list 看现有岗位，再指派 DRI`)
  }
  return card
}

/**
 * Every reason this order cannot be signed off right now.
 *
 * The same four checks used to live in the tool only; they live here so the
 * panel cannot grow a second opinion. Messages are the ones callers already
 * see — the store's own gates keep their own wording.
 *
 * Two identities are deliberately kept apart: `by` is the label written to the
 * log (`lead` when nothing is bound), while `role` is the real bound role and
 * may be `undefined`. Only a real role can be the order's own DRI: judging by
 * the label would make a hand-edited `dri: "lead"` impossible for the lead to
 * sign, which is the false positive that ruled out the store-level check.
 *
 * `note` is undefined when nobody has been asked for one yet (the panel's read
 * view), and a string when a sign request carries one. `approve` is undefined
 * when the question is "could this be signed off at all"; a blocker that only
 * applies to signing off is skipped for an explicit send-back.
 * @param order - normalized order.
 * @param options - real bound role, note (when supplied) and approval.
 * @returns blockers in a stable order; empty when the sign may proceed.
 */
export function signBlockers(order, options = {}) {
  const { role, note, approve } = options
  const blockers = []
  if (typeof role === 'string' && role !== '' && role === order.dri) {
    blockers.push({
      code: 'self_sign',
      message: `工单 ${order.id} 的领取人是 ${order.dri}：验收不能由领取人自己签`,
    })
  }
  if (note !== undefined && (typeof note !== 'string' || note.trim() === '')) {
    blockers.push({ code: 'note_required', message: 'sign 需要 note：写清签收依据，或打回时要改哪一条' })
  }
  if (order.stage !== 'review') {
    blockers.push({
      code: 'not_review',
      message: `工单 ${order.id} 现在是 ${order.stage}，只有 review 状态可以签收；先 update 到 review`,
    })
  }
  if (approve !== false && order.acceptance.length === 0) {
    blockers.push({
      code: 'no_acceptance',
      message: `工单 ${order.id} 没有验收标准，签字等于自欺：先 update 补上 acceptance`,
    })
  }
  return blockers
}

/**
 * Explain a create result in the caller's language.
 *
 * A downgrade is not an error: the order exists and is queued, and the reader
 * needs to know which of the two gates moved it. The tool prints these lines
 * verbatim; the panel renders them as an information banner.
 * @param created - output of `createOrder`.
 * @returns explanation lines; empty when nothing was downgraded and the
 *   acceptance criteria are present.
 */
export function explainCreate(created) {
  const notes = []
  if (created.reason === 'wip') {
    notes.push(`在制已满 ${created.wipLimit} 张，这单排队在 intake；先关单再 update 到 active。`)
  }
  if (created.reason === 'acceptance') {
    notes.push('这张单没有验收标准，M/L 规模不能直接进 active，已排队在 intake；补上 acceptance 再 update。')
  }
  if (created.reason === undefined && created.order.acceptance.length === 0) {
    notes.push('还没有验收标准：将来进 review 前要补上，否则签不了字。')
  }
  return notes
}

/** Gate messages mapped to the HTTP answer a panel caller should see. */
const MAPPINGS = [
  [/不能直接置为 done/, 409, 'done_forbidden'],
  [/撤单要写理由/, 400, 'note_required'],
  [/没有验收标准不能进 active/, 409, 'acceptance_gate'],
  [/只有 review 状态可以签收/, 409, 'not_review'],
  [/没有验收标准，签字等于自欺/, 409, 'no_acceptance'],
  [/不存在；用 org_board/, 404, 'order_not_found'],
  [/验收不能由领取人自己签/, 403, 'self_sign'],
  [/sign 需要 note/, 400, 'note_required'],
  [/岗位 "[^"]*" 不存在/, 400, 'unknown_role'],
  [/没有项目根，只能写全局作用域/, 400, 'no_project'],
  [/^create 需要 title/, 400, 'bad_title'],
  [/has unknown size/, 400, 'bad_size'],
  [/has unknown stage/, 400, 'bad_stage'],
  [/needs a title/, 400, 'bad_title'],
  [/invalid work order id/, 400, 'bad_id'],
  [/cannot be read/, 500, 'order_unreadable'],
]

/**
 * Map a thrown gate message onto an HTTP status and a stable error code.
 *
 * This is presentation only: the store's wording is part of the gate, so it is
 * matched rather than rewritten. `test/rules.test.js` asserts one row per gate
 * so a reworded gate fails loudly instead of degrading to `unknown`.
 * @param error - unknown thrown value.
 * @returns the status and code to answer with.
 */
export function classify(error) {
  const text = error instanceof Error ? error.message : String(error ?? '')
  for (const [pattern, status, code] of MAPPINGS) {
    if (pattern.test(text)) return { status, code }
  }
  return { status: 400, code: 'unknown' }
}

/**
 * Create one order through the shared rules.
 *
 * `wipLimit` is required on purpose: `occupied >= undefined` is false, so a
 * caller that forgets it silently disables the work-in-progress gate.
 * @param dirs - order directories.
 * @param input - title, size, DRI, acceptance, note, scope and actor.
 * @param options - role lookup and the caller's slot budget.
 * @returns the created order plus the downgrade reason, as `createOrder` does.
 * @throws Error when the title is missing, the DRI is unknown, or the slot
 *   budget was not supplied.
 */
export function createWithRules(dirs, input, options = {}) {
  const title = String(input?.title ?? '').trim()
  if (title === '') throw new Error('create 需要 title：一句话说清要交付什么')
  const wipLimit = options.wipLimit
  if (typeof wipLimit !== 'number' || !Number.isFinite(wipLimit)) {
    throw new Error('createWithRules 需要 wipLimit：漏传会让在制上限静默失效')
  }
  const dri = typeof input.dri === 'string' && input.dri !== '' ? input.dri : undefined
  if (dri !== undefined) requireRoleId(options.lookupRole, dri)
  return createOrder(dirs, {
    scope: input.scope === 'project' || input.scope === 'global' ? input.scope : undefined,
    title,
    size: input.size,
    dri,
    acceptance: acceptanceOf(input.acceptance),
    note: typeof input.note === 'string' ? input.note : undefined,
    by: input.by,
    wipLimit,
  })
}

/**
 * Patch one order through the shared rules.
 *
 * Gates stay in `store.js`; this only adds the DRI check and the two text
 * parsers, so "comma does not separate" holds for the panel as well.
 * @param dirs - order directories.
 * @param input - id, patch and actor.
 * @param options - role lookup.
 * @returns the saved order.
 * @throws Error when the order is missing, the DRI is unknown, or a stage gate
 *   refuses the patch.
 */
export function updateWithRules(dirs, input, options = {}) {
  const found = requireOrder(dirs, input?.id)
  const patch = input.patch ?? {}
  const dri = typeof patch.dri === 'string' && patch.dri !== '' ? patch.dri : undefined
  if (dri !== undefined) requireRoleId(options.lookupRole, dri)
  return saveOrder(dirs, {
    id: found.order.id,
    by: input.by,
    patch: {
      ...(patch.stage === undefined ? {} : { stage: patch.stage }),
      ...(patch.title === undefined ? {} : { title: patch.title }),
      ...(patch.size === undefined ? {} : { size: patch.size }),
      ...(patch.dri === undefined ? {} : { dri: patch.dri }),
      ...(patch.acceptance === undefined ? {} : { acceptance: acceptanceOf(patch.acceptance) }),
      ...(patch.artifacts === undefined ? {} : { artifacts: artifactsOf(patch.artifacts) }),
      ...(patch.note === undefined ? {} : { note: patch.note }),
    },
  })
}

/**
 * Sign an order off, or send it back, through the shared rules.
 *
 * Order matters: the blockers run first and the first one throws, then
 * `store.signOrder` re-checks the stage and the acceptance criteria. No gate is
 * re-implemented here.
 *
 * A sign request always asks for a note, so a missing one is normalized to the
 * empty string here — otherwise `undefined` would be read as "nobody asked yet"
 * and a note-less sign would reach the store. `by` is the log label, `role` the
 * real binding; see {@link signBlockers} for why they are not the same value.
 * @param dirs - order directories.
 * @param input - id, approval, note, log label (`by`) and the real bound role.
 * @returns the signed order.
 * @throws Error carrying `code` and `blockers` when a blocker applies.
 */
export function signWithRules(dirs, input) {
  const found = requireOrder(dirs, input?.id)
  const approve = input.approve === true
  const note = input.note ?? ''
  const blockers = signBlockers(found.order, { role: input.role, note, approve })
  if (blockers.length > 0) {
    const error = new Error(blockers[0].message)
    error.code = blockers[0].code
    error.blockers = blockers
    throw error
  }
  return signOrder(dirs, {
    id: found.order.id,
    approved: approve,
    by: typeof input.by === 'string' && input.by !== '' ? input.by : 'lead',
    note: String(note).trim(),
  })
}

/**
 * Read one order by id or fail with the board's vocabulary.
 * @param dirs - order directories.
 * @param id - raw id argument.
 * @returns the located order.
 * @throws Error when the id is empty or unknown.
 */
function requireOrder(dirs, id) {
  const text = String(id ?? '').trim()
  if (text === '') throw new Error('这个 action 需要 id')
  const found = readOrder(dirs, text)
  if (found === undefined) throw new Error(`工单 ${text} 不存在；用 org_board 的 action=list 查看现有工单`)
  return found
}

/**
 * Normalize acceptance criteria from a tool argument or a request body.
 * @param value - newline-separated text, or a list.
 * @returns trimmed, non-empty criteria.
 */
function acceptanceOf(value) {
  const items = Array.isArray(value) ? value : [value]
  return splitLines(items.filter((entry) => typeof entry === 'string').join('\n'))
}

/**
 * Normalize artifact paths from a tool argument or a request body.
 * @param value - comma- or newline-separated text, or a list.
 * @returns trimmed, non-empty paths.
 */
function artifactsOf(value) {
  const items = Array.isArray(value) ? value : [value]
  return splitList(items.filter((entry) => typeof entry === 'string').join(','))
}
