/**
 * Host inspect provider for the tool catalog the model actually receives.
 *
 * `Tool/listTools` reads `ctx.tools.schemas()`, i.e. the registry. A tool
 * executor's transport is deliberately outside that registry — `run_code` is a
 * reserved name whose registration throws — so a session can see and call
 * `run_code` while every inspect query says it does not exist. The model-facing
 * catalog is assembled per request from `executor.describe(...)`, exposed only
 * through `systemPrompt.assemble().tools`, which is what this provider reports.
 *
 * The provider is registered at Host scope on purpose: the executor instance is
 * re-created whenever the preset's generation is, so a provider owned by that
 * generation would collide with its predecessor while the old generation still
 * has users.
 *
 * Shipped packages are resolved inside `apply()`, never at module scope: the
 * Cordis loader turns a rejected plugin import into a bare `never started` row
 * with the cause only in the Host log.
 *
 * @module @chrock-studio/dsh-tool-catalog
 */
import { scopeOf } from '@deepseek-ai/dsh-scope'

import type { HostContext } from '@chrock-studio/dsh-hyper-shared/host'

/** No input: the requesting Agent is the subject. */
const NO_INPUT = { type: 'object', properties: {}, additionalProperties: false }
/** Output is validated against this schema; a bare description accepts any JSON data. */
const ANY_OUTPUT = { description: 'Tool schemas the next model request for the requesting Agent carries.' }

const MANIFEST = {
  id: 'ToolCatalog',
  description: 'Tool schemas assembled for the requesting Agent, including transports an executor advertises (such as run_code). Tool/listTools reports registry capabilities instead, which never include a transport.',
  methods: [{
    name: 'listTools',
    description: 'Return the tool schemas the next model request for this Agent carries, in catalog order.',
    inputSchema: NO_INPUT,
    outputSchema: ANY_OUTPUT,
  }],
}

/** Cordis plugin name. */
export const name = 'tool-catalog'
/** Prompt assembly is the only source of the model-facing catalog. */
export const inject = ['systemPrompt']

/**
 * Register the `ToolCatalog` inspect provider when the Host runs one.
 * @param ctx - mounting context, owning the provider's lifetime.
 * @throws Error naming the package whose resolution failed.
 */
export function apply(ctx: HostContext): void {
  const prompt = ctx.systemPrompt
  ctx.inject(['cordisInspect'], (host) => {
    const inspect = host.cordisInspect
    if (inspect === undefined || prompt === undefined) return
    host.effect(() => inspect.register({
      manifest: MANIFEST,
      async query(method: string, _input: unknown, { agent }: { agent: { ctx?: unknown } }) {
        if (method !== 'listTools') throw new Error(`unknown ToolCatalog inspect method "${method}"`)
        const scope = scopeOf(agent.ctx as Parameters<typeof scopeOf>[0])
        const assembly = await prompt.assemble(scope === undefined ? {} : { scope })
        return { tools: assembly.tools }
      },
    }), 'tool-catalog: inspect provider')
  })
}
