/**
 * Tool action dispatch.
 *
 * @module @chrock-studio/dsh-hyper-wiki/tools/run
 */
import type { ToolActionInput, ToolResult } from './context.ts'
import { failure } from './context.ts'
import {
  backlinksAction,
  listAction,
  readAction,
  searchAction,
} from './read-actions.ts'
import { draftAction, statusAction } from './write-actions.ts'

/** The six actions the tool exposes, in help order. */
export const WIKI_ACTIONS = ['list', 'search', 'read', 'draft', 'status', 'backlinks']

/**
 * Run one tool action.
 *
 * Exported so tests can drive every action without a DSH tool runtime.
 * @param input - validated arguments plus the resolved caller facts.
 * @returns `{ ok, action, summary, data }`.
 */
export function runWikiAction(input: ToolActionInput): ToolResult {
  const { action } = input
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
