/**
 * Wiring test: replaces the three shipped modules the executor drives with
 * fakes, so `describe`, `execute`, and `apply` can be exercised without a
 * mounted DSH runtime. They are ordinary peer imports now; mocking them keeps
 * the test free of the installation.
 */
import { beforeEach, describe, expect, mock, test } from 'bun:test'

const nativeCalls = []
const programCalls = []

const fakes = {
  '@deepseek-ai/dsh-tools': {
    RUN_CODE_NAME: 'run_code',
    projectToolSchema: (definition) => ({ name: definition.name, description: definition.description }),
  },
  '@deepseek-ai/dsh-tool-executor-native': {
    NativeToolExecutor: class {
      describe(tools) { return { schemas: tools.map((t) => ({ name: t.name })) } }
      execute(input) {
        nativeCalls.push(input.calls.map((c) => c.id))
        return Promise.resolve({
          results: input.calls.map((c) => ({ callId: c.id, result: { content: `native:${c.id}` } })),
          additionalContexts: [],
          concluded: false,
        })
      }
    },
  },
  '@deepseek-ai/dsh-tool-executor-ptc': {
    Config: {},
    renderToolsSdk: (schemas) => `TS SDK for ${schemas.length} tools`,
    renderToolsSdkPy: (schemas) => `PY SDK for ${schemas.length} tools`,
    PtcExecutor: class {
      describe() { return { schemas: [{ name: 'run_code', description: 'transport' }], knownNames: ['run_code'] } }
      execute(input) {
        programCalls.push(input.calls.map((c) => c.id))
        return Promise.resolve({
          results: input.calls.map((c) => ({ callId: c.id, result: { content: `program:${c.id}` } })),
          additionalContexts: [{ id: 'ctx-from-program' }],
          concluded: true,
        })
      }
    },
  },
}

mock.module('@deepseek-ai/dsh-tools', () => fakes['@deepseek-ai/dsh-tools'])
mock.module('@deepseek-ai/dsh-tool-executor-native', () => fakes['@deepseek-ai/dsh-tool-executor-native'])
mock.module('@deepseek-ai/dsh-tool-executor-ptc', () => fakes['@deepseek-ai/dsh-tool-executor-ptc'])

const mod = await import('../src/index.ts')
const { HybridToolExecutor } = mod
const { HYBRID_INSTRUCTION, RUN_CODE_PREFERENCE } = await import('../src/policy.ts')

const TOOLS = [
  { name: 'bash', description: 'run shell', output: { schema: { type: 'object' } } },
  { name: 'read', description: 'read file', output: { schema: { type: 'object' } } },
]
const section = (name) => ({ name, order: 1 })

function makeCtx(language = 'typescript') {
  return {
    ptcRuntime: language ? { language, programFormat: 'function-body' } : undefined,
    systemPrompt: { getSectionOrder: (name) => (name === 'PTC_ONLY' ? 800 : 5000) },
  }
}

describe('HybridToolExecutor', () => {
  beforeEach(() => { nativeCalls.length = 0; programCalls.length = 0 })

  test('advertises the run_code transport beside every native schema', () => {
    const executor = new HybridToolExecutor(makeCtx())
    const described = executor.describe(TOOLS)
    expect(described.schemas.map((s) => s.name)).toEqual(['run_code', 'bash', 'read'])
    expect(described.knownNames).toEqual(['bash', 'read', 'run_code'])
  })

  test('registers one surface section and one SDK section', () => {
    const executor = new HybridToolExecutor(makeCtx())
    expect(executor.sections.map((s) => s.name)).toEqual(['tools:hybrid-surface', 'tools:hybrid-sdk'])
    expect(executor.sections[1].text(TOOLS)).toContain('TS SDK for 2 tools')
  })

  test('the surface section carries the routing policy', () => {
    const executor = new HybridToolExecutor(makeCtx())
    expect(executor.sections[0].text).toBe(HYBRID_INSTRUCTION)
    expect(executor.sections[0].order).toBe(800)
  })

  test('states the routing preference beside the transport only', () => {
    const executor = new HybridToolExecutor(makeCtx())
    const described = executor.describe(TOOLS)
    expect(described.schemas[0].description).toBe(`transport ${RUN_CODE_PREFERENCE}`)
    expect(described.schemas.slice(1).map((s) => s.description)).toEqual(['run shell', 'read file'])
  })

  test('describes an identical catalog on every step, for request-cache stability', () => {
    const executor = new HybridToolExecutor(makeCtx())
    expect(executor.describe(TOOLS)).toEqual(executor.describe(TOOLS))
  })

  test('routes a pure direct batch to the native executor', async () => {
    const executor = new HybridToolExecutor(makeCtx())
    const out = await executor.execute({ calls: [{ id: 'a', name: 'bash' }, { id: 'b', name: 'read' }], signal: {} })
    expect(nativeCalls).toEqual([['a', 'b']])
    expect(programCalls).toEqual([])
    expect(out.results.map((r) => r.result.content)).toEqual(['native:a', 'native:b'])
  })

  test('splits a mixed batch into consecutive groups, then restores call order', async () => {
    const executor = new HybridToolExecutor(makeCtx())
    const calls = [
      { id: 'a', name: 'bash' },
      { id: 'b', name: 'run_code' },
      { id: 'c', name: 'run_code' },
      { id: 'd', name: 'read' },
    ]
    const out = await executor.execute({ calls, signal: {} })
    expect(nativeCalls).toEqual([['a'], ['d']])
    expect(programCalls).toEqual([['b', 'c']])
    expect(out.results.map((r) => r.callId)).toEqual(['a', 'b', 'c', 'd'])
    expect(out.results.map((r) => r.result.content)).toEqual([
      'native:a', 'program:b', 'program:c', 'native:d',
    ])
    expect(out.additionalContexts).toEqual([{ id: 'ctx-from-program' }])
    expect(out.concluded).toBe(true)
  })

  test('falls back to the native surface without a supported runtime', async () => {
    const executor = new HybridToolExecutor(makeCtx(null))
    expect(executor.describe(TOOLS).schemas.map((s) => s.name)).toEqual(['bash', 'read'])
    const out = await executor.execute({
      calls: [{ id: 'a', name: 'run_code' }],
      signal: {},
    })
    expect(programCalls).toEqual([])
    expect(nativeCalls).toEqual([['a']])
    expect(out.results.map((r) => r.callId)).toEqual(['a'])
  })
})

describe('apply', () => {
  test('registers exactly one executor inside a scope effect', () => {
    const { apply, name, inject } = mod
    const registered = []
    let effectRan = false
    const ctx = {
      ...makeCtx(),
      tools: { setExecutor: (executor) => { registered.push(executor); return () => {} } },
      effect: (body) => { effectRan = true; return body() },
    }
    apply(ctx, { maxSubCallsPerMinute: 1024, maxParallelSubCalls: 10 })
    expect(effectRan).toBe(true)
    expect(registered).toHaveLength(1)
    expect(registered[0]).toBeInstanceOf(mod.HybridToolExecutor)
    expect(name).toBe('hybrid-tool-executor')
    expect(inject).toEqual(['tools', 'systemPrompt', 'ptcRuntime'])
  })

})
