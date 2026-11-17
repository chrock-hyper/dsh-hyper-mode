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
 * @module @chrock-studio/dsh-hyper-wiki/tools/define
 */
import { PAGE_STATUSES } from '../page.js'
import { runWikiAction, WIKI_ACTIONS } from './run.js'

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
