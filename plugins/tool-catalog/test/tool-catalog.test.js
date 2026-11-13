/**
 * Wiring test: the provider is registered against a fake Host, so the manifest
 * contract and the assembly call can be asserted without mounting a runtime.
 * `lib/shared` resolution is faked for the same reason as the executor's test.
 */
import { describe, expect, test, mock } from 'bun:test'

const assembleCalls = []
const registered = []

mock.module('../../shared/shipped.js', () => ({
  loadShipped: (specifier) => {
    if (specifier !== '@deepseek-ai/dsh-scope') throw new Error(`unexpected specifier: ${specifier}`)
    return { scopeOf: (ctx) => ctx.scopeKey }
  },
}))

const mod = await import('../index.js')
const { apply, name, inject } = mod

const TOOLS = [
  { name: 'run_code', description: 'Execute a program.' },
  { name: 'read', description: 'Read a file.' },
]

function makeCtx() {
  return {
    systemPrompt: {
      assemble: (context) => {
        assembleCalls.push(context)
        return Promise.resolve({ tools: TOOLS })
      },
    },
    inject: (services, callback) => {
      expect(services).toEqual(['cordisInspect'])
      callback({
        effect: (body) => { body() },
        cordisInspect: { register: (registration) => { registered.push(registration); return () => {} } },
      })
    },
  }
}

const registration = () => {
  apply(makeCtx())
  return registered[registered.length - 1]
}

describe('tool-catalog provider', () => {
  test('registers the documented manifest', () => {
    const provider = registration()
    expect(provider.manifest.id).toBe('ToolCatalog')
    expect(provider.manifest.description).toContain('Tool/listTools')
    expect(provider.manifest.methods.map((method) => method.name)).toEqual(['listTools'])
  })

  test('reports the assembled catalog rather than the registry', async () => {
    const provider = registration()
    const out = await provider.query('listTools', undefined, { agent: { ctx: { scopeKey: 'agent-scope' } } })
    expect(out).toEqual({ tools: TOOLS })
    expect(assembleCalls[assembleCalls.length - 1]).toEqual({ scope: 'agent-scope' })
  })

  test('falls back to the global layer without a scoped Agent', async () => {
    const provider = registration()
    await provider.query('listTools', undefined, { agent: { ctx: {} } })
    expect(assembleCalls[assembleCalls.length - 1]).toEqual({})
  })

  test('rejects an undeclared method', async () => {
    const provider = registration()
    await expect(provider.query('listRegistry', undefined, { agent: { ctx: {} } })).rejects.toThrow(/unknown ToolCatalog/)
  })

  test('keeps its module scope free of shipped imports', () => {
    expect(name).toBe('tool-catalog')
    expect(inject).toEqual(['systemPrompt'])
  })
})
