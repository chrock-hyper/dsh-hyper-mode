import { describe, expect, test } from 'bun:test'
import { groupConsecutive, mergeBatch } from '../src/split.ts'

const isProgram = (call) => call.name === 'run_code'
const call = (id, name) => ({ id, name, input: {} })

describe('groupConsecutive', () => {
  test('keeps one group when every call shares a shape', () => {
    const calls = [call('1', 'bash'), call('2', 'read')]
    expect(groupConsecutive(calls, isProgram)).toEqual([
      { kind: 'direct', calls: [calls[0], calls[1]] },
    ])
  })

  test('splits on shape change and preserves submission order', () => {
    const calls = [call('1', 'bash'), call('2', 'run_code'), call('3', 'run_code'), call('4', 'edit')]
    expect(groupConsecutive(calls, isProgram).map((g) => [g.kind, g.calls.map((c) => c.id)])).toEqual([
      ['direct', ['1']],
      ['program', ['2', '3']],
      ['direct', ['4']],
    ])
  })

  test('returns no groups for an empty batch', () => {
    expect(groupConsecutive([], isProgram)).toEqual([])
  })
})

describe('mergeBatch', () => {
  test('restores the original call order across groups', () => {
    const calls = [call('a', 'bash'), call('b', 'run_code'), call('c', 'edit')]
    const parts = [
      { results: [{ callId: 'a', result: { content: 'A' } }], additionalContexts: [], concluded: false },
      { results: [{ callId: 'b', result: { content: 'B' } }], additionalContexts: [], concluded: false },
      { results: [{ callId: 'c', result: { content: 'C' } }], additionalContexts: [], concluded: true },
    ]
    expect(mergeBatch(calls, parts)).toEqual({
      results: [
        { callId: 'a', result: { content: 'A' } },
        { callId: 'b', result: { content: 'B' } },
        { callId: 'c', result: { content: 'C' } },
      ],
      additionalContexts: [],
      concluded: true,
    })
  })

  test('concatenates deferred contexts and drops unknown results', () => {
    const calls = [call('a', 'bash')]
    const parts = [
      { results: [{ callId: 'a', result: {} }], additionalContexts: [{ id: 'ctx-1' }], concluded: false },
      { results: [{ callId: 'gone', result: {} }], additionalContexts: [{ id: 'ctx-2' }], concluded: false },
    ]
    const merged = mergeBatch(calls, parts)
    expect(merged.additionalContexts).toEqual([{ id: 'ctx-1' }, { id: 'ctx-2' }])
    expect(merged.results).toHaveLength(1)
    expect(merged.concluded).toBe(false)
  })
})
