/**
 * `/hyper-skill`: install this bundle's plugin-shipped skills on demand.
 *
 * DSH discovers skills only from scanned roots (project `<root>/.dsh/skills`,
 * `~/.dsh/skills`, `customSkillDirs`, …) and `skill-filesystem` watches those
 * roots, so a skill linked into one shows up in the next catalog without a
 * restart. This command is the human surface for that: it lists the skills the
 * bundle ships, links the chosen one into a scanned root, and reports where it
 * landed. No model message, no prompt token cost.
 *
 * The command declares `input` on purpose: the Web client only routes argument
 * text to a command that advertises an input descriptor. It lives at Host scope
 * so every mode sees it, and it registers no system-prompt text.
 *
 * Module scope imports only Node builtins and local modules: the Cordis loader
 * turns a rejected plugin import into a bare `never started` row with the cause
 * only in the Host log, so this file must not resolve any shipped package at
 * import time.
 *
 * The command grammar, the discovery walk and the link ownership rules each
 * live in their own module; this file is the plugin entry and the assembly.
 *
 * @module @chrock-hyper/dsh-hyper-skills
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { dshHomePath } from '@deepseek-ai/dsh-home-paths'

import type { AgentHandle, HostContext } from '@chrock-hyper/dsh-hyper-shared/host'
import { findProjectRoot } from '@chrock-hyper/dsh-hyper-shared/paths'

import { runSkillCommand } from './command.ts'

export { discoverSkills } from './discover.ts'
export { parseSkillFile } from './frontmatter.ts'
export { runSkillCommand } from './command.ts'

/** Cordis plugin name. */
export const name = 'hyper-skills'
/** Needs only the human-command registry. */
export const inject = ['commands']

/** Command name without the leading slash. */
const COMMAND_NAME = 'hyper-skill'

/**
 * Resolve `<dsh home>/skills` the way the skill provider does.
 *
 * `dshHomePath` is the provider's own resolver: it honours `DSH_HOME` and falls
 * back to `~/.dsh`, so re-deriving the path here would only add a second copy
 * of that rule.
 * @returns the user-level scanned root.
 */
function resolveUserSkillsDir(): string {
  return dshHomePath('skills')
}

/**
 * Resolve the project-level scanned root for the invoking session.
 * @param ctx - Host context.
 * @param agent - the agent whose UI dispatched the command.
 * @returns `<project root>/.dsh/skills`, or undefined without a known directory.
 */
function resolveProjectSkillsDir(ctx: HostContext, agent: AgentHandle | undefined): string | undefined {
  let cwd: unknown
  try {
    cwd = ctx.get('workingDirectory')?.get?.(agent?.session)
  } catch {
    cwd = undefined
  }
  if (typeof cwd !== 'string' || cwd === '') return undefined
  return join(findProjectRoot(cwd), '.dsh', 'skills')
}

/**
 * Register `/hyper-skill` for every composed human-command adapter.
 * @param ctx - Host context carrying the command registry.
 */
export function apply(ctx: HostContext): void {
  // `<packages root>/<package>/skills/`: this package's own directory is
  // `packages/hyper-skills`, so the scan root is its parent.
  const packagesRoot = dirname(fileURLToPath(new URL('../', import.meta.url)))
  const userSkillsDir = resolveUserSkillsDir()
  const commands = ctx.commands
  if (commands === undefined) return
  ctx.effect(
    () =>
      commands.register({
        name: COMMAND_NAME,
        description: '按需安装本 bundle 插件自带的 skills',
        input: { hint: 'list | install <名称> [--project] | remove <名称>' },
        handler: (invocation) =>
          runSkillCommand(
            {
              packagesRoot,
              userSkillsDir,
              projectSkillsDir: resolveProjectSkillsDir(ctx, invocation.agent),
            },
            invocation.rawInput,
          ),
      }),
    'hyper-skills: command',
  )
}
