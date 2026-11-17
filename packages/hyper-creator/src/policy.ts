/**
 * Routing policy for the hybrid surface: when to orchestrate through a program
 * and when to call one tool directly.
 *
 * Pure data, so `bun test` can assert the policy without mounting Cordis and so
 * a wording change never touches the executor's batching logic.
 *
 * The rule is thresholded on purpose. A program saves round trips and keeps large
 * payloads out of the conversation, but it costs a generation of code and it
 * nests the results, so "always program" would be a net loss for two small reads.
 * @module @chrock-hyper/dsh-hyper-creator/policy
 */

/**
 * A model-facing tool schema.
 *
 * These objects come from the shipped executors, so only `name` and
 * `description` are known here; every other field (`parameters`, `output`, …) is
 * carried through untouched by the index signature. Narrowing this type would
 * make `withRunCodePreference` reject real schemas, so it stays open.
 */
export interface ToolSchema {
  name: string
  description?: unknown
  [key: string]: unknown
}

/** Replaces PTC's "run_code is the only callable tool" rule at the same section order. */
export const HYBRID_INSTRUCTION = `Tools are reachable two ways: call one directly, or orchestrate several in a \`run_code\` program. Direct calls and programs may appear in the same response.

Write a program when you can name the steps before you start: two or more calls whose intermediate values you only consume, independent reads or searches to join, a fan-out over a list, or a pipeline that returns a summary. One program costs one generation of code and saves N round trips, and for large results it keeps the payload out of the conversation.

Call one tool directly for a single step, when its result must be visible or approved before you choose the next call, when you are still exploring and cannot name the next call, or when a nested card would lose detail the user needs, such as an image or a diff.

Inside a program, catch per-item errors so one failure does not hide the rest, print only the curated result, and keep destructive or externally visible actions as direct calls when the user should review them one by one. Programs are capped at 10 minutes: split large fan-outs and report progress instead of spending the whole budget in one run.

For DeepSeek Harness authoring work — writing or changing a bundle, plugin, preset, tool, skill, or MCP connection — load the \`dsh-doc\` skill first, read it in full, then read the references it names for the surface you are touching. Do not author DSH itself from memory: its loader, composition, and authorization rules are version-specific, and a plausible-looking patch can fail silently.`

/** The same rule restated where the model decides, beside the transport it names. */
export const RUN_CODE_PREFERENCE = `Prefer this over a direct call when one response needs two or more tool calls whose intermediate values you only consume: independent reads or searches to join, a fan-out over a list, or a pipeline that returns a summary. Call a tool directly for a single step, or when its result must be visible or approved before you choose the next call.`

/**
 * Append the routing preference to the program transport's own description.
 *
 * Only the named transport changes; every other schema is returned as-is, so the
 * native catalog keeps its shipped text and its object identity. Re-applying the
 * same policy is a no-op, which keeps a repeated `describe` byte-identical.
 * @param schema - model-facing tool schema.
 * @param runCodeName - the reserved program transport name.
 * @returns the schema with the preference appended, or the original schema.
 */
export function withRunCodePreference(schema: ToolSchema, runCodeName: string): ToolSchema {
  if (schema.name !== runCodeName) return schema
  const base = typeof schema.description === 'string' ? schema.description.trimEnd() : ''
  if (base.endsWith(RUN_CODE_PREFERENCE)) return schema
  return { ...schema, description: base === '' ? RUN_CODE_PREFERENCE : `${base} ${RUN_CODE_PREFERENCE}` }
}
