/**
 * View models for the Wiki panel.
 *
 * Every shape here is a plain JSON payload from the Host's `/wiki/*` routes or
 * a piece of panel state; nothing is constructed from a file directly, so the
 * optional fields describe what a route may omit rather than what it may type
 * wrongly.
 */

/** The wiki store a request targets. */
export type ScopeName = 'global' | 'project'

/** The three document tabs in the middle column. */
export type TabName = 'source' | 'preview' | 'draft'

/** The modal a rail action opens. */
export type DialogKind = 'force' | 'delete' | 'reject' | 'rename'

export interface DialogState {
  kind: DialogKind
}

/** The failure flag every Host route repeats in its body. */
export interface ApiEnvelope {
  ok?: boolean
  message?: string
}

/** One row of the page tree (`GET /wiki/pages`). */
export interface PageRow {
  path: string
  title: string
  tags?: string[]
  status?: string
}

/** One row of the queue (`GET /wiki/drafts`). */
export interface DraftRow {
  path: string
  status?: string
  author?: string
  stale?: boolean
}

/** The one draft attached to a selected page. */
export interface Draft {
  status?: string
  author?: string
  base?: string
  updated?: string
  reason?: string
  stale?: boolean
  body?: string
}

/** A page that links to the selected one. */
export interface Backlink {
  path: string
  title: string
}

/** `GET /wiki/page` for the selected page. */
export interface PageDetail {
  path: string
  title: string
  text: string
  body: string
  status?: string
  updated?: string
  tags?: string[]
  backlinks?: Backlink[]
  errors?: string[]
  draft?: Draft | null
}

/** One scope row of `GET /wiki/state`. */
export interface ScopeRow {
  scope: string
  git?: boolean
  contract?: string
}

export interface BootState extends ApiEnvelope {
  scopes?: ScopeRow[]
}

export interface PagesBody extends ApiEnvelope {
  pages?: PageRow[]
}

export interface DraftsBody extends ApiEnvelope {
  drafts?: DraftRow[]
}

export interface PageBody extends PageDetail, ApiEnvelope {}

/** `GET /wiki/pending`, polled for the sidebar badge. */
export interface PendingBody extends ApiEnvelope {
  total?: number
}

/** A JSON request body; every Host mutation takes a small flat object. */
export type RequestBody = Record<string, unknown>
