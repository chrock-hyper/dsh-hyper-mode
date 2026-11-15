/**
 * The role marker and the three texts a role produces: the brief handed to a
 * freshly spawned child, the compact section injected into every step, and the
 * roster the lead reads.
 *
 * The marker is the durable half of the binding: it lives in the child's first
 * user message, so the identity survives resume, fork and replay, and a human
 * can bind a session by typing the same line. The visible texts are derived
 * from the role file on every step, so editing a role takes effect without
 * respawning anything.
 *
 * @module @chrock-studio/dsh-hyper-mode/hyper-roles/marker
 */

/** Exact binding line; anchored so prose that mentions a role does not bind it. */
const MARKER = /<!--\s*role:\s*([a-z0-9][a-z0-9-]{0,63})\s*-->/

/**
 * The line that binds a message to a role.
 * @param id - role id.
 * @returns the marker as it appears in a message.
 */
export function bindLine(id) {
  return `<!-- role:${id} -->`
}

/**
 * Find the first bound role id in a text.
 * @param text - any message text.
 * @returns the role id, or undefined.
 */
export function extractRole(text) {
  const match = MARKER.exec(String(text ?? ''))
  return match === null ? undefined : match[1]
}

/**
 * Concatenate the text blocks of one message.
 * @param message - user message payload from a session event.
 * @returns its text content.
 */
export function messageText(message) {
  const content = Array.isArray(message?.content) ? message.content : []
  return content
    .filter((block) => block !== null && typeof block === 'object' && block.type === 'text')
    .map((block) => String(block.text ?? ''))
    .join('\n')
}

/**
 * Render one role card for a human-facing or self-inspection result.
 *
 * This is what `role action=brief` and `action=read` return: the whole body,
 * the routing metadata a call needs, the newest experience entries, and the
 * path of the reading guide — bounded so one call cannot flood the context.
 * @param card - resolved role card.
 * @param options - notes, guide text, and the character budget.
 * @returns the card as compact Markdown.
 */
export function renderCard(card, options = {}) {
  const budget = positive(options.maxChars, 6000)
  const fields = card.fields
  const lines = [
    `## ${fields.title}（${fields.id}）`,
    `${scopeLabel(card.scope)}作用域 · v${fields.version} · ${card.path}`,
  ]
  if (fields.capabilities.length > 0) lines.push(`能力：${fields.capabilities.join('、')}`)
  if (fields.skills.length > 0) lines.push(`技能：${fields.skills.join('、')}`)
  if (fields.handoffs.length > 0) lines.push(`交接：${fields.handoffs.join('、')}`)
  if (fields.can.length > 0) lines.push(`权限：${fields.can.join('、')}`)
  if (typeof fields.model === 'string' && fields.model !== '') lines.push(`模型：${fields.model}`)
  lines.push('', '---', '', clip(String(card.body ?? '').trim(), Math.floor(budget * 0.6)))
  const notes = options.notes ?? []
  if (notes.length > 0) {
    lines.push('', '### 最近经验')
    for (const note of notes) lines.push(`- ${note.at.slice(0, 10)} · ${clip(note.text.replace(/\s+/g, ' '), 240)}`)
  }
  if (typeof options.guide === 'string' && options.guide.trim() !== '') {
    lines.push('', '### 岗位指导', clip(options.guide.trim(), Math.floor(budget * 0.2)))
  }
  if (card.notesPath !== undefined) lines.push('', `经验文件：${card.notesPath}`)
  if (card.guidePath !== undefined) lines.push(`指导文件：${card.guidePath}`)
  return clip(lines.join('\n'), budget)
}

/**
 * Render the brief that opens a spawned child's task.
 *
 * This is the only place a full card reaches the model unprompted: later steps
 * read the compact section instead, and the role tool loads detail on demand.
 * @param card - resolved role card.
 * @param options - notes to quote, guide text, and the character budget.
 * @returns the brief, fenced off from the task by a rule.
 */
export function renderBrief(card, options = {}) {
  const budget = positive(options.maxChars, 6000)
  const fields = card.fields
  const lines = [
    `【岗位】${fields.title}（${fields.id} · ${scopeLabel(card.scope)} · v${fields.version}）`,
    '',
    '职责：',
    clip(paragraphOf(card.body), Math.floor(budget * 0.5)),
  ]
  if (fields.capabilities.length > 0) lines.push('', `能力：${fields.capabilities.join('、')}`)
  if (fields.skills.length > 0) {
    lines.push('', `技能：${fields.skills.join('、')}（用 \`role\` 的 action=skill 读取全文）`)
  }
  if (typeof fields.model === 'string' && fields.model !== '') {
    lines.push('', `模型：${fields.model}（本次委派按这个路由启动）`)
  }
  if (fields.handoffs.length > 0) {
    lines.push('', `交接对象：${fields.handoffs.join('、')}（需要他们接手时用 \`role_spawn\`）`)
  }
  const notes = options.notes ?? []
  if (notes.length > 0) {
    lines.push('', '最近经验：')
    for (const note of notes.slice(-3)) lines.push(`- ${clip(note.text.replace(/\s+/g, ' '), 200)}`)
  }
  if (typeof options.guide === 'string' && options.guide.trim() !== '') {
    lines.push('', '岗位指导（阅读顺序与相关 wiki）：', clip(options.guide.trim(), 800))
  }
  lines.push('', '以上是你的岗位约定；接下来是本次任务。', '---', '')
  return lines.join('\n')
}

/**
 * Render the compact per-step section for a bound agent.
 * @param card - resolved role card.
 * @param options - guide path preview, note count and character budget.
 * @returns the section text, or an empty string when the budget leaves nothing.
 */
export function renderSelf(card, options = {}) {
  const budget = positive(options.maxChars, 1200)
  const fields = card.fields
  const parts = [`## 你的岗位`, `${fields.id} · ${fields.title}（${scopeLabel(card.scope)}，v${fields.version}）`]
  const duty = paragraphOf(card.body)
  if (duty !== '') parts.push('', `职责：${clip(duty, Math.floor(budget * 0.6))}`)
  if (fields.capabilities.length > 0) parts.push(`能力：${fields.capabilities.join('、')}`)
  if (fields.skills.length > 0) parts.push(`技能：${fields.skills.join('、')}（用 \`role\` 的 action=skill 读取全文）`)
  if (fields.handoffs.length > 0) parts.push(`交接：${fields.handoffs.join('、')}`)
  const tail = []
  if (options.guidePath !== undefined) tail.push(`岗位指导：${options.guidePath}`)
  if (typeof options.noteCount === 'number' && options.noteCount > 0) tail.push(`经验条目：${options.noteCount} 条`)
  tail.push('用 `role` 读取职责全文、技能与经验；写经验用 `role` 的 action=note')
  parts.push('', clip(tail.join('；'), Math.max(120, budget - parts.join('\n').length)))
  return clip(parts.join('\n'), budget)
}

/**
 * Render the roster section the lead uses to pick a role.
 * @param rows - role summaries with scope labels.
 * @param options - how many entries to list.
 * @returns the section text, or an empty string without roles.
 */
export function renderRoster(rows, options = {}) {
  if (rows.length === 0) return ''
  const max = positive(options.max, 20)
  const listed = rows.slice(0, max)
  const lines = [
    '## 岗位',
    '可用岗位（委派时优先用 `role_spawn`，它会把岗位卡片写进子代理的任务开头；在子代理任务首行写 `<!-- role:<id> -->` 同样能绑定岗位）：',
  ]
  for (const row of listed) {
    const hint = row.summary === '' ? '' : ` — ${clip(row.summary, 90)}`
    lines.push(`- ${row.id} · ${row.title}（${scopeLabel(row.scope)}）${hint}`)
  }
  if (rows.length > listed.length) lines.push(`- 另有 ${rows.length - listed.length} 个岗位，用 \`role\` 的 action=list 查看`)
  lines.push('', '用 `role` 读取某个岗位的职责、技能与经验；用 `role_edit` 新建或修改岗位。')
  return lines.join('\n')
}

/**
 * First prose paragraph of a card body.
 * @param body - card body.
 * @returns one paragraph without headings.
 */
export function paragraphOf(body) {
  const collected = []
  for (const line of String(body ?? '').split('\n')) {
    if (line.startsWith('#')) {
      if (collected.length > 0) break
      continue
    }
    if (line.trim() === '') {
      if (collected.length > 0) break
      continue
    }
    collected.push(line.trim())
  }
  return collected.join(' ')
}

/**
 * Truncate text at a character budget, marking the cut.
 * @param text - source text.
 * @param max - positive character budget.
 * @returns the text, truncated with an ellipsis when needed.
 */
export function clip(text, max) {
  const value = String(text ?? '')
  if (value.length <= max) return value
  return `${value.slice(0, Math.max(0, max - 1))}…`
}

/** @param scope - scope name. @returns its Chinese label. */
export function scopeLabel(scope) {
  if (scope === 'project') return '项目'
  if (scope === 'global') return '全局'
  return '未知作用域'
}

/** @param value - candidate. @param fallback - default. @returns a positive integer. */
function positive(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? value : fallback
}
