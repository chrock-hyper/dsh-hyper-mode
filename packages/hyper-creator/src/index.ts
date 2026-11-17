/**
 * Hybrid tool executor for one agent scope: direct tool calls AND programmatic
 * `run_code` in the same composer.
 *
 * The built-in pair is exclusive — `tool-executor-native` lets the model call
 * every visible tool directly, `tool-executor-ptc` allows only `run_code`. This
 * executor composes both: `describe` advertises the `run_code` transport beside
 * every native schema, and `execute` splits one model batch into consecutive
 * runs that each go to the executor that owns that call shape.
 *
 * The shipped executors and schema helpers are plain imports. They are declared
 * as peers, so a link install resolves the workspace copy and a packed install
 * resolves the installation's own; either way the module graph is the same one
 * the Host runs.
 *
 * @module @chrock-hyper/dsh-hyper-creator
 */
import { RUN_CODE_NAME, projectToolSchema } from '@deepseek-ai/dsh-tools'
import { NativeToolExecutor } from '@deepseek-ai/dsh-tool-executor-native'
import { PtcExecutor, renderToolsSdk, renderToolsSdkPy } from '@deepseek-ai/dsh-tool-executor-ptc'

import type { Disposable, HostContext, SystemPromptService, ToolRegistry } from '@chrock-hyper/dsh-hyper-shared/host'

import type { ToolSchema } from './policy.ts'
import { HYBRID_INSTRUCTION, withRunCodePreference } from './policy.ts'
import type { BatchResult, ModelCall } from './split.ts'
import { groupConsecutive, mergeBatch } from './split.ts'

/** Reworded for the dual surface; the PTC preset's "only run_code" rule does not apply here. */
const SDK_HEADER = 'The declarations below are program-only SDK bindings for run_code. They do not make a name directly callable; call a name that also appears as a separate tool schema directly.'

/** A visible tool definition as the Host hands it to an executor. Opaque past `name` and its output schema. */
export interface ToolDefinition {
  name: string
  /** Output half of the definition; only its schema reaches the SDK block. */
  output: { schema: unknown }
  [key: string]: unknown
}

/** One execution batch as an executor receives it. */
export interface ExecutionInput {
  calls: ModelCall[]
  signal?: unknown
  [key: string]: unknown
}

/** One executor's catalog projection of the visible tools. */
export interface DescribeResult {
  schemas: ToolSchema[]
  /** Transport names the framework treats as callable beside the registry's tools. */
  knownNames: string[]
}

/**
 * The part of a tool executor this hybrid composes.
 *
 * The real native and PTC executors are wider objects; only these two seams are
 * called here, and both are read as the shipped packages define them.
 */
export interface ToolExecutor {
  describe(tools: readonly ToolDefinition[]): DescribeResult
  execute(input: ExecutionInput): Promise<BatchResult>
}

/** Per-batch concurrency the executors resolve themselves. */
export type MaxParallel = () => number

/**
 * SDK renderers keyed by the mounted PTC runtime's language.
 *
 * `typescript` and `python` are the two languages the PTC runtime defines; any
 * other value leaves `ptcAvailable()` false instead of throwing here.
 */
export type RuntimeLanguage = 'typescript' | 'python'

/** Render the SDK block for one language; Python takes no program format. */
export type SdkRenderer = (schemas: readonly ToolSchema[], programFormat?: unknown) => string

/** The PTC runtime seam: which language is mounted and how its programs are shaped. */
export interface PtcRuntime {
  language: RuntimeLanguage
  programFormat?: unknown
}

/**
 * `ctx.tools` as this executor uses it.
 *
 * `HostContext` types the registry's `register` only; `setExecutor` is the
 * selection seam this plugin mounts through, so it is declared here.
 */
export interface ExecutorToolRegistry extends ToolRegistry {
  setExecutor(executor: HybridToolExecutor): Disposable
}

/** `ctx.systemPrompt` as this executor uses it: section order, in addition to registration. */
export interface OrderedPromptService extends SystemPromptService {
  getSectionOrder(name: string): number
}

/**
 * The mounting context this executor needs.
 *
 * `HostContext` covers `effect` but not the executor selection, the prompt
 * section order, or the PTC runtime, so those are declared locally rather than
 * widening the shared Host interface.
 */
export interface ExecutorContext extends HostContext {
  tools: ExecutorToolRegistry
  systemPrompt: OrderedPromptService
  ptcRuntime?: PtcRuntime
}

/** One prompt section this executor contributes; the registry renders it. */
export interface HybridPromptSection {
  name: string
  order: number
  text: string | ((tools: readonly ToolDefinition[]) => string)
  interpolate: boolean
}

/** PTC subcall allowance and concurrency limits, forwarded to the PTC executor unchanged. */
export interface PtcConfig {
  /** Nested tool calls allowed per minute of program runtime. */
  maxSubCallsPerMinute?: number
  /** Nested tool calls one program may run at once. */
  maxParallelSubCalls?: number
}

/** `@deepseek-ai/dsh-tool-executor-native`: the direct-call executor. */
interface NativeExecutorModule {
  NativeToolExecutor: new (ctx: ExecutorContext, maxParallel?: MaxParallel) => ToolExecutor
}

/** `@deepseek-ai/dsh-tool-executor-ptc`: the program executor plus both SDK renderers. */
interface PtcExecutorModule {
  PtcExecutor: new (ctx: ExecutorContext, config?: PtcConfig, maxParallel?: MaxParallel) => ToolExecutor
  renderToolsSdk: SdkRenderer
  renderToolsSdkPy: SdkRenderer
}

/** `@deepseek-ai/dsh-tools`: the reserved transport name and schema projection. */
interface ToolsModule {
  RUN_CODE_NAME: string
  /**
   * @param definition - visible capability or executor-owned transport.
   * @param detachParameters - copy parameters for a caller-owned inspection result.
   * @returns the model-facing schema fields.
   */
  projectToolSchema(definition: ToolDefinition, detachParameters: boolean): ToolSchema
}

/** Everything the hybrid resolves from the installation, shaped as one bundle. */
export interface ShippedModules extends NativeExecutorModule, PtcExecutorModule, ToolsModule {}

/**
 * Assemble the shipped pieces the hybrid drives.
 *
 * They are plain imports: `peerDependencies` route a link install to the
 * workspace copy, and a packed install to the installation's own copy. The
 * local interfaces describe only the seam this executor uses.
 * @returns the executor classes and schema helpers.
 */
function resolveShipped(): ShippedModules {
  return {
    NativeToolExecutor: NativeToolExecutor as unknown as NativeExecutorModule['NativeToolExecutor'],
    PtcExecutor: PtcExecutor as unknown as PtcExecutorModule['PtcExecutor'],
    renderToolsSdk: renderToolsSdk as unknown as SdkRenderer,
    renderToolsSdkPy: renderToolsSdkPy as unknown as SdkRenderer,
    RUN_CODE_NAME,
    projectToolSchema: projectToolSchema as unknown as ToolsModule['projectToolSchema'],
  }
}

/** Splits mixed batches by call shape and delegates to the owning executor. */
export class HybridToolExecutor {
  /** Context owning this executor's selection and lifetime. */
  declare readonly ctx: ExecutorContext
  /** Resolved shipped packages. */
  declare readonly shipped: ShippedModules
  /** Direct-call executor. */
  declare readonly native: ToolExecutor
  /** Program executor. */
  declare readonly ptc: ToolExecutor
  /** Prompt sections this executor contributes through the registry. */
  declare readonly sections: HybridPromptSection[]

  /**
   * @param ctx - context owning this executor's selection and lifetime.
   * @param config - PTC subcall allowance and concurrency limits.
   * @param maxParallel - native batch concurrency, resolved per batch.
   * @param shipped - resolved shipped packages; defaults to the installation.
   */
  constructor(
    ctx: ExecutorContext,
    config: PtcConfig = {},
    maxParallel: MaxParallel = () => 10,
    shipped: ShippedModules = resolveShipped(),
  ) {
    this.ctx = ctx
    this.shipped = shipped
    this.native = new shipped.NativeToolExecutor(ctx, maxParallel)
    this.ptc = new shipped.PtcExecutor(ctx, config, maxParallel)
    this.sections = [
      {
        name: 'tools:hybrid-surface',
        order: ctx.systemPrompt.getSectionOrder('PTC_ONLY'),
        text: HYBRID_INSTRUCTION,
        interpolate: false,
      },
      {
        name: 'tools:hybrid-sdk',
        order: ctx.systemPrompt.getSectionOrder('TOOLS_SDK'),
        text: (tools) => this.renderSdk(tools),
        interpolate: false,
      },
    ]
  }

  /** SDK renderers keyed by the PTC runtime's language. */
  get renderers(): Record<RuntimeLanguage, SdkRenderer> {
    return { typescript: this.shipped.renderToolsSdk, python: this.shipped.renderToolsSdkPy }
  }

  /** True when a PTC runtime with a supported SDK language is mounted. */
  ptcAvailable(): boolean {
    const runtime = this.ctx.ptcRuntime
    return Boolean(runtime && this.renderers[runtime.language])
  }

  /** Render the SDK block for this step's visible tools, or nothing without a runtime. */
  renderSdk(tools: readonly ToolDefinition[]): string {
    if (!this.ptcAvailable()) return ''
    // `ptcAvailable()` above guarantees a mounted runtime.
    const runtime = this.ctx.ptcRuntime!
    const render = this.renderers[runtime.language]
    const schemas = tools.map((definition) => ({
      ...this.shipped.projectToolSchema(definition, false),
      output: definition.output.schema,
    }))
    return `${SDK_HEADER}\n\n${render(schemas, runtime.programFormat)}`
  }

  /** Advertise the transport beside every native schema; keep the catalog order stable. */
  describe(tools: readonly ToolDefinition[]): DescribeResult {
    const nativeSchemas = tools.map((definition) => this.shipped.projectToolSchema(definition, false))
    const nativeNames = tools.map((definition) => definition.name)
    if (!this.ptcAvailable()) return { schemas: nativeSchemas, knownNames: nativeNames }
    const programSchemas = this.ptc.describe(tools).schemas
      .map((schema) => withRunCodePreference(schema, this.shipped.RUN_CODE_NAME))
    return {
      schemas: [...programSchemas, ...nativeSchemas],
      knownNames: [...nativeNames, this.shipped.RUN_CODE_NAME],
    }
  }

  /**
   * Execute one model batch, preserving submission order across both call shapes.
   *
   * Consecutive same-shape groups run one after another so a mutating direct call
   * keeps its barrier against a program and vice versa; results are re-ordered
   * back into the model's original call order by `mergeBatch`.
   */
  async execute(input: ExecutionInput): Promise<BatchResult> {
    const isProgram = (call: ModelCall): boolean => call.name === this.shipped.RUN_CODE_NAME && this.ptcAvailable()
    const groups = groupConsecutive(input.calls, isProgram)
    if (groups.length === 1) {
      // The length check above guarantees the element exists.
      return (groups[0]!.kind === 'program' ? this.ptc : this.native).execute(input)
    }
    const parts: BatchResult[] = []
    for (const group of groups) {
      const executor = group.kind === 'program' ? this.ptc : this.native
      parts.push(await executor.execute({ ...input, calls: group.calls }))
    }
    return mergeBatch(input.calls, parts)
  }
}

/** Cordis plugin name. */
export const name = 'hybrid-tool-executor'
/** Tool registration, prompt sections, and the PTC runtime seam. */
export const inject = ['tools', 'systemPrompt', 'ptcRuntime']

/**
 * Select hybrid execution in the mounting Agent or preset scope.
 * @param ctx - context owning this executor's selection and lifetime.
 * @param config - timeout-based subcall allowance and concurrency limits.
 */
export function apply(ctx: ExecutorContext, config?: PtcConfig): void {
  ctx.effect(() => ctx.tools.setExecutor(new HybridToolExecutor(ctx, config)))
}
