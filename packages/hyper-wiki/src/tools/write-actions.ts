/**
 * Write-side actions: `draft` and `status`.
 *
 * `draft` is the only way an agent writes: it leaves a draft for a human to
 * approve. `status` reports the caller's own drafts, including the reason a
 * rejection carried.
 *
 * @module @chrock-studio/dsh-hyper-wiki/tools/write-actions
 */
import type { DraftRow } from '../store/drafts.ts'
import type { ToolActionInput, ToolResult } from './context.ts'
import { failure, pickScope, presentScopes } from './context.ts'

/** One status row: a draft without its mirrored text. */
type StatusRow = Omit<DraftRow, 'text'> & { text: undefined }

/**
 * `draft`: write or replace the draft mirroring one page.
 * @param input - action input.
 * @returns the draft path and recorded base.
 */
export function draftAction(input: ToolActionInput): ToolResult {
  if (input.path === undefined || input.path === '') return failure('draft', 'path is required for action "draft"')
  if (input.content === undefined || input.content === '') return failure('draft', 'content is required for action "draft"')
  const chosen = pickScope(input, true)
  if (chosen.error !== undefined) return chosen.error
  const result = input.core.writeDraft(chosen.scope, {
    path: input.path,
    content: input.content,
    title: input.title,
    tags: input.tags,
    status: input.status,
    author: input.caller,
  })
  if (result.ok !== true) return failure('draft', result.message ?? 'cannot write draft', result.code)
  const action = result.replaced ? 'replaced' : 'created'
  return {
    ok: true,
    action: 'draft',
    summary: [
      `draft ${action}: ${result.draftPath} (scope ${chosen.scope.scope})`,
      `base: ${result.base}`,
      'Waiting for human approval in the Wiki panel. Do not repeat the write; tell the human what to review.',
    ].join('\n'),
    data: {
      scope: chosen.scope.scope,
      path: result.path,
      draftPath: result.draftPath,
      base: result.base,
      created: result.created === true,
      replaced: result.replaced === true,
    },
  }
}

/**
 * `status`: the caller's own drafts, with rejection reasons.
 * @param input - action input.
 * @returns the draft summary.
 */
export function statusAction(input: ToolActionInput): ToolResult {
  const rows: StatusRow[] = []
  for (const scope of presentScopes(input)) {
    for (const draft of input.core.drafts(scope)) {
      if (draft.author !== input.caller) continue
      rows.push({ ...draft, text: undefined, scope: scope.scope })
    }
  }
  const lines = rows.map(row => [
    `${row.scope}  ${row.path}  ${row.status}${row.stale ? '  (stale: base no longer matches)' : ''}`,
    row.reason ? `   reason: ${row.reason}` : '',
    row.updated ? `   updated: ${row.updated}` : '',
  ].filter(Boolean).join('\n'))
  return {
    ok: true,
    action: 'status',
    summary: rows.length === 0
      ? `No drafts by ${input.caller}. Approved drafts disappear; rejected ones stay with a reason.`
      : `${rows.length} draft(s) by ${input.caller}:\n${lines.join('\n')}`,
    data: { author: input.caller, drafts: rows },
  }
}
