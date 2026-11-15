/**
 * Rendering for work orders: the full card a caller reads, the board a lead
 * scans, and the two-line pulse that rides in the system prompt.
 *
 * Every renderer is bounded — an order log grows without limit, and a board
 * with forty orders must not cost more than a board with four.
 *
 * @module @chrock-studio/dsh-hyper-mode/hyper-org/marker
 */

/** Characters kept from one log line in a card. */
const LOG_CHARS = 200
/** Log entries shown on a card. */
const LOG_SHOWN = 6

/**
 * Render one order for a model to act on.
 * @param order - normalized order.
 * @param options - role title, scope label and log budget.
 * @returns compact Markdown.
 */
export function renderOrder(order, options = {}) {
  const lines = [
    `## ${order.id} · ${order.title}`,
    `${options.scope === 'project' ? '项目' : '全局'}作用域 · 阶段 ${order.stage} · 规模 ${order.size}`
      + (order.dri === undefined ? ' · 未指派' : ` · 领取人 ${order.dri}${options.driTitle === undefined ? '' : `（${options.driTitle}）`}`),
  ]
  if (order.acceptance.length > 0) {
    lines.push('', '验收标准：')
    for (const entry of order.acceptance) lines.push(`- ${entry}`)
  } else {
    lines.push('', '验收标准：无（M/L 规模的单必须补上才能进 active，否则签不了字）')
  }
  if (order.artifacts.length > 0) {
    lines.push('', `交付物：${order.artifacts.join('、')}`)
  }
  const shown = order.log.slice(-(options.logShown ?? LOG_SHOWN))
  if (shown.length > 0) {
    lines.push('', `### 最近 ${shown.length} 条记录`)
    for (const entry of shown) {
      lines.push(`- ${entry.at.slice(0, 16).replace('T', ' ')} · ${entry.by} · ${clip(entry.note, LOG_CHARS)}`)
    }
  }
  return lines.join('\n')
}

/**
 * Render the whole board.
 * @param summary - output of the caller's order listing.
 * @param options - slot limit.
 * @returns compact Markdown, one row per order.
 */
export function renderBoard(summary, options = {}) {
  const limit = options.wipLimit ?? 2
  const rows = summary.merged
  if (rows.length === 0) return '还没有工单。用 `org_order` 的 action=create 建一张。'
  const occupied = rows.filter((order) => ['active', 'review', 'blocked'].includes(order.stage)).length
  const lines = [`## 工单看板（在制 ${occupied}/${limit}）`]
  const order = ['review', 'blocked', 'active', 'intake', 'done', 'dropped']
  const sorted = [...rows].sort((left, right) => order.indexOf(left.stage) - order.indexOf(right.stage))
  for (const row of sorted) {
    const dri = row.dri === undefined ? '未指派' : row.dri
    const age = ageOf(row.updatedAt)
    lines.push(`- ${row.id} · ${clip(row.title, 40)}（${row.stage}，${dri}，${age}）`)
  }
  if (occupied > limit) {
    lines.push('', `在制已超上限 ${limit}：新单会被压到 intake 排队，先关单或撤单。`)
  }
  if (summary.problems.length > 0) {
    lines.push('', `${summary.problems.length} 个工单文件无法解析：`)
    for (const problem of summary.problems) lines.push(`- ${problem.path} — ${problem.message}`)
  }
  return lines.join('\n')
}

/**
 * Render the system-prompt pulse: what is on the desk right now.
 * @param summary - order listing.
 * @param options - slot limit and row budget.
 * @returns the section text, or an empty string when nothing is open.
 */
export function renderPulse(summary, options = {}) {
  const limit = options.wipLimit ?? 2
  const rows = summary.merged.filter((order) => order.stage !== 'done' && order.stage !== 'dropped')
  if (rows.length === 0) return ''
  const occupied = rows.filter((order) => ['active', 'review', 'blocked'].includes(order.stage)).length
  const lines = [`## 公司：在制工单（${occupied}/${limit}）`]
  const sorted = [...rows].sort((left, right) => {
    const order = ['review', 'blocked', 'active', 'intake']
    return order.indexOf(left.stage) - order.indexOf(right.stage)
  })
  for (const row of sorted.slice(0, options.rows ?? 3)) {
    const dri = row.dri === undefined ? '未指派' : row.dri
    lines.push(`- ${row.id} · ${clip(row.title, 30)}（${row.stage}，${dri}）`)
  }
  if (rows.length > (options.rows ?? 3)) lines.push(`- 另有 ${rows.length - (options.rows ?? 3)} 张未列出，用 org_board 查看`)
  lines.push('', '接单走 `org_order`，验收走 `org_order` 的 action=sign；未签字不算完成。')
  return lines.join('\n')
}

/**
 * Human-scale age of one timestamp.
 * @param iso - ISO timestamp.
 * @returns something like `3 天`.
 */
function ageOf(iso) {
  const then = Date.parse(iso)
  if (!Number.isFinite(then)) return '未知'
  const minutes = Math.max(0, Math.round((Date.now() - then) / 60_000))
  if (minutes < 60) return `${minutes} 分钟`
  if (minutes < 60 * 24) return `${Math.round(minutes / 60)} 小时`
  return `${Math.round(minutes / (60 * 24))} 天`
}

/**
 * Bound one string.
 * @param text - input.
 * @param max - character budget.
 * @returns the clipped text.
 */
function clip(text, max) {
  const value = String(text ?? '').trim()
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1))}…`
}
