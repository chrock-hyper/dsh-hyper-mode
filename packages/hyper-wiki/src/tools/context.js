/**
 * Tool action context: which scopes an action may address, and its failures.
 *
 * An action names one scope explicitly, or lets the page it names decide. The
 * resolution order is the part the tool description promises, so it lives in
 * one place shared by every action.
 *
 * @module @chrock-studio/dsh-hyper-wiki/tools/context
 */

/**
 * Both scopes that hold a wiki for this caller.
 * @param input - action input carrying `cwd`.
 * @returns the scope descriptors whose wiki exists.
 */
export function presentScopes(input) {
  const rows = []
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
export function pickScope(input, preferProject) {
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
export function failure(action, message, code = 'failed') {
  return {
    ok: false,
    action: String(action ?? ''),
    summary: `wiki ${action} failed: ${message}`,
    data: { code, message },
  }
}
