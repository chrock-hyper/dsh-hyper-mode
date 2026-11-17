/**
 * Batch splitting and result merging for the hybrid executor.
 * Pure functions: no Cordis, no tool packages, so they are unit-testable alone.
 * @module @chrock-studio/dsh-hyper-creator/split
 */

/** One model-submitted call; only `id` and `name` are read by this module. */
export interface ModelCall {
  id: string
  name: string
  [key: string]: unknown
}

/** A run of adjacent calls that share one call shape. */
export interface CallGroup<C> {
  kind: 'program' | 'direct'
  calls: C[]
}

/** One executed call's outcome, keyed back to the call that produced it. */
export interface CallResult {
  callId: string
  result: unknown
}

/**
 * One executor's result for one group of calls.
 *
 * Read defensively, hence the optional tail: `mergeBatch` accepts a part whose
 * deferred contexts or conclusion field are absent.
 */
export interface BatchPart {
  results: CallResult[]
  additionalContexts?: unknown[]
  concluded?: boolean
}

/** One merged batch: every part's outcome, re-ordered to the submitted calls. */
export interface BatchResult {
  results: CallResult[]
  additionalContexts: unknown[]
  concluded: boolean
}

/**
 * Group adjacent calls that share a call shape.
 *
 * Adjacency matters: a mutating direct call must not be reordered across a
 * program, because the executors run each group as its own barrier.
 * @param calls - model calls in submission order.
 * @param isProgram - predicate selecting the program (`run_code`) shape.
 * @returns consecutive groups, each carrying its shape and its calls.
 */
export function groupConsecutive<C extends { name: string }>(
  calls: readonly C[],
  isProgram: (call: C) => boolean,
): CallGroup<C>[] {
  const groups: CallGroup<C>[] = []
  for (const call of calls) {
    const kind = isProgram(call) ? 'program' : 'direct'
    const last = groups[groups.length - 1]
    if (last && last.kind === kind) last.calls.push(call)
    else groups.push({ kind, calls: [call] })
  }
  return groups
}

/**
 * Merge per-group results into one batch result.
 *
 * Results are re-emitted in the original input order, one outcome per input
 * call; deferred contexts concatenate and `concluded` is disjunctive.
 * @param calls - model calls in submission order.
 * @param parts - results of the per-group executions.
 * @returns settled results, deferred context, and whether a success concludes the turn.
 */
export function mergeBatch<C extends { id: string }>(calls: readonly C[], parts: readonly BatchPart[]): BatchResult {
  const byId = new Map<string, CallResult>()
  const additionalContexts: unknown[] = []
  let concluded = false
  for (const part of parts) {
    for (const result of part.results) byId.set(result.callId, result)
    if (part.additionalContexts?.length) additionalContexts.push(...part.additionalContexts)
    if (part.concluded) concluded = true
  }
  const results: CallResult[] = []
  for (const call of calls) {
    const result = byId.get(call.id)
    if (result) results.push(result)
  }
  return { results, additionalContexts, concluded }
}
