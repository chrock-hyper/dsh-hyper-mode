/**
 * Policy test: the routing rule is data, so its thresholds and its batch-hygiene
 * rules can be asserted without mounting a DSH runtime.
 */
import { describe, expect, test } from 'bun:test'

import { HYBRID_INSTRUCTION, RUN_CODE_PREFERENCE, withRunCodePreference } from '../src/policy.ts'

describe('routing policy text', () => {
  test('states a threshold instead of a blanket preference', () => {
    expect(HYBRID_INSTRUCTION).toContain('two or more calls')
    expect(HYBRID_INSTRUCTION).toContain('Call one tool directly for a single step')
  })

  test('keeps the direct-call escapes that a threshold alone would lose', () => {
    expect(HYBRID_INSTRUCTION).toContain('approved before you choose the next call')
    expect(HYBRID_INSTRUCTION).toContain('nested card would lose detail')
  })

  test('keeps the batch hygiene rules that make programs safe', () => {
    expect(HYBRID_INSTRUCTION).toContain('catch per-item errors')
    expect(HYBRID_INSTRUCTION).toContain('10 minutes')
  })

  test('requires reading dsh-doc before any DSH authoring work', () => {
    expect(HYBRID_INSTRUCTION).toContain('`dsh-doc`')
    expect(HYBRID_INSTRUCTION).toContain('bundle, plugin, preset, tool, skill, or MCP connection')
    expect(HYBRID_INSTRUCTION).toContain('read it in full')
    expect(HYBRID_INSTRUCTION).toContain('Do not author DSH itself from memory')
  })

  test('is already trimmed, so sections concatenate without stray blanks', () => {
    expect(HYBRID_INSTRUCTION).toBe(HYBRID_INSTRUCTION.trim())
    expect(RUN_CODE_PREFERENCE).toBe(RUN_CODE_PREFERENCE.trim())
  })
})

describe('withRunCodePreference', () => {
  const transport = { name: 'run_code', description: 'Execute a program.' }
  const read = { name: 'read', description: 'read file' }

  test('appends the preference to the program transport', () => {
    const out = withRunCodePreference(transport, 'run_code')
    expect(out.name).toBe('run_code')
    expect(out.description).toBe(`Execute a program. ${RUN_CODE_PREFERENCE}`)
  })

  test('leaves every other schema untouched, identity included', () => {
    expect(withRunCodePreference(read, 'run_code')).toBe(read)
  })

  test('does not mutate the input schema', () => {
    const schema = { ...transport, parameters: { type: 'object' } }
    const out = withRunCodePreference(schema, 'run_code')
    expect(out.parameters).toEqual({ type: 'object' })
    expect(schema.description).toBe('Execute a program.')
  })

  test('is idempotent, so a repeated describe stays byte-identical', () => {
    const once = withRunCodePreference(transport, 'run_code')
    expect(withRunCodePreference(once, 'run_code')).toBe(once)
  })

  test('still states the policy when the transport has no description', () => {
    expect(withRunCodePreference({ name: 'run_code' }, 'run_code').description).toBe(RUN_CODE_PREFERENCE)
  })
})
