/**
 * Tool action context: which scopes an action may address, and its failures.
 *
 * An action names one scope explicitly, or lets the page it names decide. The
 * resolution order is the part the tool description promises, so it lives in
 * one place shared by every action.
 *
 * @module @chrock-hyper/dsh-hyper-wiki/tools/context
 */
import type { ScopeIndex, WikiScope } from '../scopes.ts'
import type { WikiStore } from '../store.ts'

/** One validated tool invocation plus the caller facts. */
export interface ToolActionInput {
  action: string
  path?: unknown
  query?: unknown
  scope?: unknown
  content?: unknown
  title?: unknown
  tags?: unknown
  status?: unknown
  cwd: string | undefined
  caller: string
  core: WikiStore
  scopes: ScopeIndex
}

/** A tool call that did not produce a result. */
export interface ToolFailure {
  ok: false
  action: string
  summary: string
  data: { code: string; message: string }
}

/** A tool call that produced a result. */
export interface ToolSuccess {
  ok: true
  action: string
  summary: string
  data: unknown
}

/** What every action returns. */
export type ToolResult = ToolSuccess | ToolFailure

/** A resolved scope, or the failure to report when none resolves. */
export type PickScopeResult =
  | { scope: WikiScope; error?: undefined }
  | { scope?: undefined; error: ToolFailure }

/**
 * Both scopes that hold a wiki for this caller.
 * @param input - action input carrying `cwd`.
 * @returns the scope descriptors whose wiki exists.
 */
export function presentScopes(input: ToolActionInput): WikiScope[] {
  const rows: WikiScope[] = []
  for (const scope of input.scopes.listScopes(input.cwd)) {
    if (input.core.hasWiki(scope)) rows.push(scope)
  }
  return rows
}

/**
 * Resolve the one scope an action addresses.
 *
 * An explicit `scope` wins. Otherwise the scope already holding the page wins,
 * then (for a draft of a new page) the caller's project, then the scope whose
 * wiki exists, and finally the global store.
 * @param input - action input.
 * @param preferProject - whether an unknown page should land in the project store.
 * @returns `{ scope }` or `{ error }`.
 */
export function pickScope(input: ToolActionInput, preferProject: boolean): PickScopeResult {
  const name = input.scope
  if (name === 'global' || name === 'project') {
    const scope = input.scopes.resolveScope(name, input.cwd)
    if (scope === undefined) {
      return { error: failure(input.action, 'a project scope needs a session working directory') }
    }
    return { scope }
  }
  const globalScope = input.scopes.global()
  const projectScope = input.scopes.project(input.cwd)
  const pagePath = typeof input.path === 'string' ? input.path : ''
  if (pagePath !== '') {
    if (projectScope !== undefined && input.core.hasPage(projectScope, pagePath)) return { scope: projectScope }
    if (input.core.hasPage(globalScope, pagePath)) return { scope: globalScope }
  }
  if (preferProject && projectScope !== undefined) return { scope: projectScope }
  if (projectScope !== undefined && input.core.hasWiki(projectScope)) return { scope: projectScope }
  return { scope: globalScope }
}

/**
 * Build one tool failure.
 * @param action - the attempted action.
 * @param message - human-readable reason.
 * @param code - optional machine code.
 * @returns the canonical `{ ok: false }` value.
 */
export function failure(action: unknown, message: string, code = 'failed'): ToolFailure {
  return {
    ok: false,
    action: String(action ?? ''),
    summary: `wiki ${action} failed: ${message}`,
    data: { code, message },
  }
}
