/**
 * The `wiki` tool definition.
 *
 * One tool with six read/write actions. It deliberately has no approval
 * surface: an agent can draft, but only a human approves, rejects, deletes, or
 * renames — those live on the panel's HTTP routes.
 *
 * `createWikiTool` takes the shipped `defineTool` as an argument so the
 * definition can be built and inspected without resolving a DSH package at
 * import time (module scope may import only Node builtins and local modules).
 *
 * @module dsh-wiki/lib/tools
 */
import { PAGE_STATUSES } from './page.js'

/** The six actions the tool exposes, in help order. */
export const WIKI_ACTIONS = ['list', 'search', 'read', 'draft', 'status', 'backlinks']

/** Longest page body the tool returns inline. */
const MAX_BODY_CHARS = 20_000

/**
 * Build the `wiki` tool.
 * @param defineTool - shipped `defineTool` from `@deepseek-ai/dsh-tools`.
 * @param deps - `core` store, `scopes` index, `cwdOf(exec)`, and `callerOf(exec)`.
 * @returns a registry-ready tool definition.
 */
export function createWikiTool(defineTool, deps) {
  const core = deps.core
  const scopes = deps.scopes ?? core.scopes
  const cwdOf = typeof deps.cwdOf === 'function' ? deps.cwdOf : () => undefined
  const callerOf = typeof deps.callerOf === 'function' ? deps.callerOf : () => 'agent'

  return defineTool({
    name: 'wiki',
    description: [
      'Read and propose Markdown wiki pages. Pages live in a global store ($DSH_HOME/wiki) and an independent project store (<project>/.dsh/wiki).',
      'Your write path is a draft: call action "draft" with the page content, then tell the human to approve it in the Wiki panel. Approval, rejection, deletion and rename are human-only.',
      'Links between pages are relative Markdown links, for example [term](./guide/term.md).',
    ].join(' '),
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: WIKI_ACTIONS,
        description: 'list all pages, search titles/tags/file names, read one page, draft a page write, show your drafts, or list inbound links.',
      },
      path: {
        type: 'string',
        description: 'Page id relative to the wiki root, such as `guide/setup.md`; the `.md` suffix is optional. Required for read, draft, and backlinks.',
      },
      query: {
        type: 'string',
        description: 'Search text for action "search"; matched case-insensitively against title, tags, and file name.',
      },
      scope: {
        type: 'string',
        enum: ['global', 'project'],
        description: 'Which store to use. Omit to read the store that holds the page, or to draft into the project store when the caller has a project.',
      },
      content: {
        type: 'string',
        description: 'Page text for action "draft": either a full page document with frontmatter or a bare Markdown body.',
      },
      title: {
        type: 'string',
        description: 'Frontmatter title for the drafted page; overrides one inside `content`.',
      },
      tags: {
        type: 'string',
        description: 'Comma-separated frontmatter tags for the drafted page; overrides tags inside `content`.',
      },
      status: {
        type: 'string',
        enum: PAGE_STATUSES,
        description: 'Frontmatter status for the drafted page. Defaults to the current page status, or `wip`.',
      },
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          action: { type: 'string' },
          summary: { type: 'string' },
          data: { type: 'json' },
        },
        additionalProperties: true,
      },
      render: (_args, value) => [{ type: 'text', text: typeof value?.summary === 'string' ? value.summary : 'wiki: no result' }],
    },
    async execute(args, exec) {
      const cwd = cwdOf(exec)
      const caller = callerOf(exec)
      return runWikiAction({
        action: args.action,
        path: args.path,
        query: args.query,
        scope: args.scope,
        content: args.content,
        title: args.title,
        tags: args.tags,
        status: args.status,
        cwd,
        caller,
        core,
        scopes,
      })
    },
  })
}

/**
 * Run one tool action.
 *
 * Exported so tests can drive every action without a DSH tool runtime.
 * @param input - validated arguments plus the resolved caller facts.
 * @returns `{ ok, action, summary, data }`.
 */
export function runWikiAction(input) {
  const { action, core, scopes } = input
  switch (action) {
    case 'list':
      return listAction(input)
    case 'search':
      return searchAction(input)
    case 'read':
      return readAction(input)
    case 'draft':
      return draftAction(input)
    case 'status':
      return statusAction(input)
    case 'backlinks':
      return backlinksAction(input)
    default:
      return failure(action, `unknown action: ${String(action)}`)
  }
}

/**
 * Both scopes that hold a wiki for this caller.
 * @param input - action input carrying `cwd`.
 * @returns the scope descriptors whose wiki exists.
 */
function presentScopes(input) {
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
function pickScope(input, preferProject) {
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
 * `list`: every page in both stores.
 * @param input - action input.
 * @returns the page list summary.
 */
function listAction(input) {
  const rows = []
  for (const scope of presentScopes(input)) {
    rows.push(...input.core.list(scope))
  }
  rows.sort((left, right) => {
    if (left.scope !== right.scope) return left.scope === 'global' ? -1 : 1
    return left.path.localeCompare(right.path)
  })
  const lines = rows.map(row => `${row.scope}  ${row.path}  — ${row.title}  [${row.status}]${row.tags.length > 0 ? `  #${row.tags.join(' #')}` : ''}`)
  return {
    ok: true,
    action: 'list',
    summary: rows.length === 0
      ? 'No wiki pages yet. Draft one with action "draft" and ask the human to approve it.'
      : `${rows.length} page(s):\n${lines.join('\n')}`,
    data: { pages: rows },
  }
}

/**
 * `search`: ranked matches across both stores.
 * @param input - action input.
 * @returns the match summary.
 */
function searchAction(input) {
  const query = typeof input.query === 'string' ? input.query : ''
  if (query.trim() === '') return failure('search', 'query is required for action "search"')
  const hits = []
  for (const scope of presentScopes(input)) {
    hits.push(...input.core.search(scope, query))
  }
  hits.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score
    return left.path.localeCompare(right.path)
  })
  const capped = hits.slice(0, input.core.maxResults)
  const lines = capped.map(hit => `[${hit.score}] ${hit.scope}  ${hit.path}  — ${hit.title}  [${hit.status}]`)
  return {
    ok: true,
    action: 'search',
    summary: capped.length === 0
      ? `No page matches "${query}".`
      : `${capped.length} match(es) for "${query}":\n${lines.join('\n')}`,
    data: { query, results: capped },
  }
}

/**
 * `read`: one page, its draft state, and its backlinks.
 * @param input - action input.
 * @returns the page view summary.
 */
function readAction(input) {
  if (input.path === undefined || input.path === '') return failure('read', 'path is required for action "read"')
  const chosen = pickScope(input, false)
  if (chosen.error !== undefined) return chosen.error
  const result = input.core.read(chosen.scope, input.path)
  if (result.ok !== true) return failure('read', result.message ?? 'cannot read page', result.code)
  return readSummary('read', result)
}

/**
 * Render one page view.
 * @param action - the action name.
 * @param result - store result.
 * @returns `{ ok, action, summary, data }`.
 */
function readSummary(action, result) {
  const body = result.body ?? ''
  const clipped = body.length > MAX_BODY_CHARS
    ? `${body.slice(0, MAX_BODY_CHARS)}\n\n[truncated: ${body.length - MAX_BODY_CHARS} more characters; read the file to see the rest]`
    : body
  const backlinks = (result.backlinks ?? []).map(row => row.path)
  return {
    ok: true,
    action,
    summary: [
      `${result.scope}:${result.path} — ${result.title} [${result.status}]`,
      `tags: ${(result.tags ?? []).join(', ') || '(none)'}  updated: ${result.updated || '(none)'}`,
      `draft: ${result.draft === null || result.draft === undefined ? 'none' : `${result.draft.status} by ${result.draft.author}${result.draft.reason ? ` — ${result.draft.reason}` : ''}`}`,
      `backlinks: ${backlinks.length === 0 ? '(none)' : backlinks.join(', ')}`,
      '',
      clipped,
    ].join('\n'),
    data: {
      scope: result.scope,
      path: result.path,
      title: result.title,
      tags: result.tags,
      status: result.status,
      updated: result.updated,
      draft: result.draft,
      backlinks: result.backlinks,
      errors: result.errors,
      body: clipped,
    },
  }
}

/**
 * `draft`: write or replace the draft mirroring one page.
 * @param input - action input.
 * @returns the draft path and recorded base.
 */
function draftAction(input) {
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
function statusAction(input) {
  const rows = []
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

/**
 * `backlinks`: pages that link to one page.
 * @param input - action input.
 * @returns the inbound-link summary.
 */
function backlinksAction(input) {
  if (input.path === undefined || input.path === '') return failure('backlinks', 'path is required for action "backlinks"')
  const chosen = pickScope(input, false)
  if (chosen.error !== undefined) return chosen.error
  let result = input.core.backlinks(chosen.scope, input.path)
  if (result.ok !== true && input.scope === undefined) {
    const other = input.scopes.global()
    if (other.wikiDir !== chosen.scope.wikiDir) result = input.core.backlinks(other, input.path)
  }
  if (result.ok !== true) return failure('backlinks', result.message ?? 'cannot read backlinks', result.code)
  const rows = result.backlinks ?? []
  return {
    ok: true,
    action: 'backlinks',
    summary: rows.length === 0
      ? `${result.path}: no inbound links.`
      : `${result.path}: ${rows.length} inbound link(s)\n${rows.map(row => `${row.path}  — ${row.title}`).join('\n')}`,
    data: { path: result.path, backlinks: rows },
  }
}

/**
 * Build one tool failure.
 * @param action - the attempted action.
 * @param message - human-readable reason.
 * @param code - optional machine code.
 * @returns the canonical `{ ok: false }` value.
 */
function failure(action, message, code = 'failed') {
  return {
    ok: false,
    action: String(action ?? ''),
    summary: `wiki ${action} failed: ${message}`,
    data: { code, message },
  }
}
