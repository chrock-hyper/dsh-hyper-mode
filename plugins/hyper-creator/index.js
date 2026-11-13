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
 * Shipped packages are resolved inside `apply()`, never at module scope. The
 * Cordis loader swallows a rejected plugin import into a bare `never started`
 * row with the cause only in the Host log, so a module-scope dependency on
 * `@deepseek-ai/*` fails invisibly. Resolving in `apply()` turns the same
 * failure into a `failed: <detail>` row diagnostic, and keeps this module's own
 * import free of any specifier the bundle cannot resolve.
 *
 * @module @chrock-studio/dsh-hyper-creator
 */
import { HYBRID_INSTRUCTION, withRunCodePreference } from './lib/policy.js'
import { groupConsecutive, mergeBatch } from './lib/split.js'
import { loadShipped } from '../shared/shipped.js'

/** Reworded for the dual surface; the PTC preset's "only run_code" rule does not apply here. */
const SDK_HEADER = 'The declarations below are program-only SDK bindings for run_code. They do not make a name directly callable; call a name that also appears as a separate tool schema directly.'

/**
 * Resolve everything the executor needs from the DSH installation.
 * @param ctx - mounting context, source of the installation anchor.
 * @returns the executor classes and schema helpers.
 * @throws Error naming the package whose resolution failed.
 */
function resolveShipped(ctx) {
  const native = loadShipped('@deepseek-ai/dsh-tool-executor-native', ctx)
  const ptc = loadShipped('@deepseek-ai/dsh-tool-executor-ptc', ctx)
  const tools = loadShipped('@deepseek-ai/dsh-tools', ctx)
  return {
    NativeToolExecutor: native.NativeToolExecutor,
    PtcExecutor: ptc.PtcExecutor,
    renderToolsSdk: ptc.renderToolsSdk,
    renderToolsSdkPy: ptc.renderToolsSdkPy,
    RUN_CODE_NAME: tools.RUN_CODE_NAME,
    projectToolSchema: tools.projectToolSchema,
  }
}

/** Splits mixed batches by call shape and delegates to the owning executor. */
export class HybridToolExecutor {
  /**
   * @param ctx - context owning this executor's selection and lifetime.
   * @param config - PTC subcall allowance and concurrency limits.
   * @param maxParallel - native batch concurrency, resolved per batch.
   * @param shipped - resolved shipped packages; defaults to the installation.
   */
  constructor(ctx, config = {}, maxParallel = () => 10, shipped = resolveShipped(ctx)) {
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
  get renderers() {
    return { typescript: this.shipped.renderToolsSdk, python: this.shipped.renderToolsSdkPy }
  }

  /** True when a PTC runtime with a supported SDK language is mounted. */
  ptcAvailable() {
    const runtime = this.ctx.ptcRuntime
    return Boolean(runtime && this.renderers[runtime.language])
  }

  /** Render the SDK block for this step's visible tools, or nothing without a runtime. */
  renderSdk(tools) {
    if (!this.ptcAvailable()) return ''
    const runtime = this.ctx.ptcRuntime
    const render = this.renderers[runtime.language]
    const schemas = tools.map((definition) => ({
      ...this.shipped.projectToolSchema(definition, false),
      output: definition.output.schema,
    }))
    return `${SDK_HEADER}\n\n${render(schemas, runtime.programFormat)}`
  }

  /** Advertise the transport beside every native schema; keep the catalog order stable. */
  describe(tools) {
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
  async execute(input) {
    const isProgram = (call) => call.name === this.shipped.RUN_CODE_NAME && this.ptcAvailable()
    const groups = groupConsecutive(input.calls, isProgram)
    if (groups.length === 1) {
      return (groups[0].kind === 'program' ? this.ptc : this.native).execute(input)
    }
    const parts = []
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
export function apply(ctx, config) {
  ctx.effect(() => ctx.tools.setExecutor(new HybridToolExecutor(ctx, config)))
}
