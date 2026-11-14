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
 * @module dsh-wiki/lib/prompt
 */
/** Section name; unique within the prompt. */
export const WIKI_SECTION = 'wiki'

/**
 * Placement of the section: after the MCP tool sections and before the
 * SDK/deliverable tail, so it reads as one more tool convention.
 */
export const WIKI_SECTION_ORDER = 3200

/**
 * Build the section text.
 * @param facts - `global` and `project` scope facts (`wiki`, `contract`,
 *   `exists`).
 * @returns the prompt text, or an empty string when no wiki exists.
 */
export function wikiPromptText(facts) {
  const lines = []
  const present = []
  if (facts?.global?.exists === true) present.push(`global pages under ${facts.global.wiki}; contract ${facts.global.contract}`)
  if (facts?.project?.exists === true) present.push(`project pages under ${facts.project.wiki}; contract ${facts.project.contract}`)
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
export function wikiFacts(options) {
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
export function registerWikiPrompt(options) {
  const { ctx, scopes } = options
  const cwdOf = typeof options.cwdOf === 'function' ? options.cwdOf : () => undefined
  const systemPrompt = options.systemPrompt ?? ctx?.get?.('systemPrompt')
  if (systemPrompt === undefined || systemPrompt === null || typeof systemPrompt.section !== 'function') {
    return undefined
  }
  return ctx.effect(
    () => systemPrompt.section({
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
    }),
    'dsh-wiki: prompt section',
  )
}
