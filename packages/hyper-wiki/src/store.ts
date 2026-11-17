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
 * @module @chrock-hyper/dsh-hyper-wiki/store
 */
import type { HostLogger } from '@chrock-hyper/dsh-hyper-shared/host'

import type { GitCommitResult, GitHelper } from './git.ts'
import type { ScopeIndex, ScopeKind, WikiScope } from './scopes.ts'
import { DEFAULT_LIMIT } from './search.ts'
import { createDraftOps } from './store/drafts.ts'
import { createMutationOps } from './store/mutations.ts'
import { createPageOps } from './store/pages.ts'

export { trashStamp } from './store/mutations.ts'

/** One scope row in the panel's state view. */
export interface ScopeStateRow {
  scope: ScopeKind
  root: string
  wikiDir: string
  contract: string
  git: boolean
  exists: boolean
  pages: number
  pending: number
}

/** What the panel needs to render both scopes. */
export interface ScopeState {
  scopes: ScopeStateRow[]
  recentProjects: string[]
}

/** What `createWikiStore` needs from the plugin assembly. */
export interface WikiStoreOptions {
  scopes: ScopeIndex
  git: GitHelper
  logger?: HostLogger
  maxResults?: number
  now?: () => Date
}

/**
 * Build the store.
 * @param options - `scopes` index, `git` helper, logger, result ceiling, and a
 *   clock.
 * @returns the store API the tools, routes, and prompt share.
 */
export function createWikiStore(options: WikiStoreOptions) {
  const scopes = options.scopes
  const git = options.git
  const log: HostLogger = options.logger ?? {}
  const maxResults = Number.isFinite(options.maxResults) && (options.maxResults ?? 0) > 0
    ? Math.floor(options.maxResults ?? DEFAULT_LIMIT)
    : DEFAULT_LIMIT
  const now = typeof options.now === 'function' ? options.now : () => new Date()

  /**
   * Report whether a scope holds a wiki.
   * @param scope - scope descriptor.
   * @returns the presence flag.
   */
  const hasWiki = (scope: WikiScope): boolean => scopes.hasWiki(scope)

  /**
   * Commit a change when the scope keeps history.
   * @param scope - scope descriptor.
   * @param message - commit subject.
   * @returns the commit outcome, or undefined for a scope without history.
   */
  const commitScope = (scope: WikiScope, message: string): GitCommitResult | undefined => {
    if (scope.git !== true) return undefined
    try {
      return git.commit(scope.wikiDir, message)
    } catch (error) {
      log.warn?.(`dsh-wiki: git commit failed: ${String((error as { message?: unknown } | null)?.message ?? error)}`)
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
  const scopeState = (cwd: unknown): ScopeState => {
    const rows: ScopeStateRow[] = []
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

/** The store one plugin instance shares. */
export type WikiStore = ReturnType<typeof createWikiStore>
