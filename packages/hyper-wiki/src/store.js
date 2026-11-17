/**
 * The wiki store: filesystem effects behind one scope.
 *
 * Everything that touches a disk lives here — listing, reading, drafts,
 * approval, rejection, deletion, rename, and the optional global-scope git
 * commit. The text decisions themselves live in `page.js`, `draft.js`,
 * `links.js`, and `search.js`, so this module only wires them to paths.
 *
 * Every mutating entry point returns `{ ok: true, … }` or
 * `{ ok: false, code, message }`; none of them throws for a wiki-level
 * problem, and a git failure never fails the mutation.
 *
 * This module is the facade: reads live in `store/pages.js`, the draft
 * lifecycle in `store/drafts.js`, and the human-only effects in
 * `store/mutations.js`.
 *
 * @module @chrock-studio/dsh-hyper-wiki/store
 */
import { DEFAULT_LIMIT } from './search.js'
import { createDraftOps } from './store/drafts.js'
import { createMutationOps } from './store/mutations.js'
import { createPageOps } from './store/pages.js'

export { trashStamp } from './store/mutations.js'

/**
 * Build the store.
 * @param options - `scopes` index, `git` helper, logger, result ceiling, and a
 *   clock.
 * @returns the store API the tools, routes, and prompt share.
 */
export function createWikiStore(options) {
  const scopes = options.scopes
  const git = options.git
  const log = options.logger ?? {}
  const maxResults = Number.isFinite(options.maxResults) && options.maxResults > 0
    ? Math.floor(options.maxResults)
    : DEFAULT_LIMIT
  const now = typeof options.now === 'function' ? options.now : () => new Date()

  /**
   * Report whether a scope holds a wiki.
   * @param scope - scope descriptor.
   * @returns the presence flag.
   */
  const hasWiki = scope => scopes.hasWiki(scope)

  /**
   * Commit a change when the scope keeps history.
   * @param scope - scope descriptor.
   * @param message - commit subject.
   * @returns the commit outcome, or undefined for a scope without history.
   */
  const commitScope = (scope, message) => {
    if (scope.git !== true) return undefined
    try {
      return git.commit(scope.wikiDir, message)
    } catch (error) {
      log.warn?.(`dsh-wiki: git commit failed: ${error?.message ?? error}`)
      return { committed: false, reason: 'git commit failed' }
    }
  }

  const draftOps = createDraftOps({ now, commit: commitScope })
  const pageOps = createPageOps({ readDraft: draftOps.readDraft, maxResults })
  const mutationOps = createMutationOps({ now, commit: commitScope, pages: pageOps.pages })

  /**
   * The panel view of both scopes.
   * @param cwd - a directory the panel knows about.
   * @returns scope rows with presence and pending counts.
   */
  const scopeState = cwd => {
    const rows = []
    for (const scope of scopes.listScopes(cwd)) {
      const present = hasWiki(scope)
      rows.push({
        scope: scope.scope,
        root: scope.root,
        wikiDir: scope.wikiDir,
        contract: scope.contractFile,
        git: scope.git === true,
        exists: present,
        pages: pageOps.list(scope).length,
        pending: draftOps.pending(scope),
      })
    }
    return { scopes: rows, recentProjects: scopes.readRecent() }
  }

  return {
    scopes,
    maxResults,
    hasWiki,
    pages: pageOps.pages,
    list: pageOps.list,
    hasPage: pageOps.hasPage,
    read: pageOps.read,
    search: pageOps.search,
    backlinks: pageOps.backlinks,
    drafts: draftOps.drafts,
    readDraft: draftOps.readDraft,
    writeDraft: draftOps.writeDraft,
    approve: draftOps.approve,
    reject: draftOps.reject,
    remove: mutationOps.remove,
    rename: mutationOps.rename,
    writePage: mutationOps.writePage,
    pending: draftOps.pending,
    scopeState,
  }
}
