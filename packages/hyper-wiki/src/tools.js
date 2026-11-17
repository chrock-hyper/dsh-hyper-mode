/**
 * The `wiki` tool definition.
 *
 * One tool with six read/write actions. It deliberately has no approval
 * surface: an agent can draft, but only a human approves, rejects, deletes, or
 * renames — those live on the panel's HTTP routes.
 *
 * This module is the facade: the tool shape lives in `tools/define.js`, the
 * action dispatch and help order in `tools/run.js`, the scope resolution in
 * `tools/context.js`, and the handlers in `tools/read-actions.js` and
 * `tools/write-actions.js`.
 *
 * @module @chrock-studio/dsh-hyper-wiki/tools
 */
export { createWikiTool } from './tools/define.js'
export { runWikiAction, WIKI_ACTIONS } from './tools/run.js'
