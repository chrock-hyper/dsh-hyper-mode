/**
 * The system-prompt section for the wiki convention.
 *
 * The convention itself needs no plugin: a directory of Markdown files is
 * readable by any agent or editor. This section exists only to tell the model
 * that the stores exist for the current scope, which tool reads them, and that
 * writes must go through a draft a human approves.
 *
 * The section is four lines at most and is empty when neither scope holds a
 * wiki, so a profile without a wiki pays nothing.
 *
 * @module @chrock-studio/dsh-hyper-wiki/prompt
 */
import type {
  AgentHandle,
  Disposable,
  HostContext,
  PromptSection,
  SystemPromptService,
} from '@chrock-studio/dsh-hyper-shared/host'

import type { ScopeIndex } from './scopes.ts'

/** Section name; unique within the prompt. */
export const WIKI_SECTION = 'wiki'

/**
 * Placement of the section: after the MCP tool sections and before the
 * SDK/deliverable tail, so it reads as one more tool convention.
 */
export const WIKI_SECTION_ORDER = 3200

/** What the prompt says about one scope. */
export interface ScopeFacts {
  wiki?: string
  contract?: string
  exists: boolean
}

/** Both scopes as the prompt text consumes them. */
export interface WikiFacts {
  global?: ScopeFacts
  project?: ScopeFacts
}

/** Options `wikiFacts` reads. */
export interface WikiFactsOptions {
  scopes: ScopeIndex
  cwd: unknown
}

/** Options `registerWikiPrompt` reads. */
export interface WikiPromptOptions {
  ctx: HostContext
  scopes: ScopeIndex
  cwdOf?: (agent: AgentHandle) => string | undefined
  systemPrompt?: SystemPromptService
}

/** The section shape this plugin registers; the Host tolerates one extra flag. */
interface WikiPromptSection extends PromptSection {
  interpolate?: boolean
}

/**
 * Build the section text.
 * @param facts - `global` and `project` scope facts (`wiki`, `contract`,
 *   `exists`).
 * @returns the prompt text, or an empty string when no wiki exists.
 */
export function wikiPromptText(facts: WikiFacts | undefined): string {
  const lines: string[] = []
  const present: string[] = []
  const globalFacts = facts?.global
  if (globalFacts?.exists === true) present.push(`global pages under ${globalFacts.wiki}; contract ${globalFacts.contract}`)
  const projectFacts = facts?.project
  if (projectFacts?.exists === true) present.push(`project pages under ${projectFacts.wiki}; contract ${projectFacts.contract}`)
  if (present.length === 0) return ''
  lines.push(`Wiki: ${present.join('; ')}.`)
  lines.push('Use the `wiki` tool for list, search, read, and backlinks. To change content call action "draft" with the page text — the human approves or rejects it in the Wiki panel, so never write a page file directly.')
  lines.push('Pages link to each other with relative Markdown links such as [term](./guide/term.md); `[[wikilinks]]` are not supported.')
  return lines.join('\n')
}

/**
 * Describe the two scopes for the prompt.
 * @param options - `scopes` index and the caller's directory.
 * @returns the facts `wikiPromptText` consumes.
 */
export function wikiFacts(options: WikiFactsOptions): WikiFacts {
  const scopes = options.scopes
  const projectScope = scopes.project(options.cwd)
  const globalScope = scopes.global()
  return {
    global: {
      wiki: globalScope.wikiDir,
      contract: globalScope.contractFile,
      exists: scopes.hasWiki(globalScope),
    },
    project: projectScope === undefined
      ? undefined
      : {
          wiki: projectScope.wikiDir,
          contract: projectScope.contractFile,
          exists: scopes.hasWiki(projectScope),
        },
  }
}

/**
 * Register the prompt section.
 * @param options - `ctx` with `systemPrompt`, `scopes`, and `cwdOf(agent)`.
 * @returns the registration disposer, or undefined when the section could not
 *   be registered.
 */
export function registerWikiPrompt(options: WikiPromptOptions): Disposable | undefined {
  const { ctx, scopes } = options
  const cwdOf: (agent: AgentHandle) => string | undefined =
    typeof options.cwdOf === 'function' ? options.cwdOf : () => undefined
  // `systemPrompt` is not one of the shared Host overloads, so the seam is one
  // cast rather than a wider shared interface.
  const systemPrompt = options.systemPrompt ?? (ctx.get('systemPrompt') as SystemPromptService | undefined)
  if (systemPrompt === undefined || systemPrompt === null || typeof systemPrompt.section !== 'function') {
    return undefined
  }
  const section: WikiPromptSection = {
    name: WIKI_SECTION,
    order: WIKI_SECTION_ORDER,
    interpolate: false,
    text: context => {
      try {
        const agent = context?.agent
        const cwd = agent === undefined ? undefined : cwdOf(agent)
        return wikiPromptText(wikiFacts({ scopes, cwd }))
      } catch {
        // A prompt provider must never fail an assembly.
        return ''
      }
    },
  }
  return ctx.effect(
    () => systemPrompt.section(section),
    'dsh-wiki: prompt section',
  )
}
