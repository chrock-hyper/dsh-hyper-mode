/**
 * The binding projection is the durable half of "which role am I": first bound
 * message wins, everything else leaves the state reference untouched.
 */
import { describe, expect, test } from 'bun:test'

import { boundRoleOf, roleBindingDefinition } from '../src/binding.ts'
import { messageText } from '../src/marker.ts'

const { apply, init, stateSchema } = roleBindingDefinition

/** @param text - one text block. @returns a user message event. */
const userMessage = (text) => ({
  type: 'user/message',
  data: { content: [{ type: 'text', text }], source: { kind: 'human' } },
})

describe('role binding projection', () => {
  test('starts unbound and ignores unrelated events', () => {
    const initial = init()
    expect(initial).toBeNull()
    expect(apply(initial, { type: 'assistant/message', data: {} })).toBe(initial)
  })

  test('binds on the first marker', () => {
    const bound = apply(null, userMessage('<!-- role:reviewer -->\n请评审这个变更'))
    expect(bound).toEqual({ role: 'reviewer' })
  })

  test('keeps the first binding even when a later message names another role', () => {
    const bound = apply(null, userMessage('<!-- role:reviewer -->'))
    const again = apply(bound, userMessage('<!-- role:architect -->'))
    expect(again).toBe(bound)
  })

  test('does not bind on prose that merely mentions a role', () => {
    expect(apply(null, userMessage('用 role 工具看看 reviewer 这个岗位'))).toBeNull()
  })

  test('validates persisted state', () => {
    expect(stateSchema.parse(null)).toBeNull()
    expect(stateSchema.parse({ role: 'reviewer' })).toEqual({ role: 'reviewer' })
    expect(() => stateSchema.parse({ role: 'Bad Id' })).toThrow(/not a role id/)
    expect(() => stateSchema.parse('reviewer')).toThrow()
  })

  test('reads the role through a handle', () => {
    let state = { role: 'architect' }
    const handle = { stateOf: () => state }
    expect(boundRoleOf(handle, { session: {} })).toBe('architect')
    state = null
    expect(boundRoleOf(handle, { session: {} })).toBeUndefined()
    expect(boundRoleOf(undefined, { session: {} })).toBeUndefined()
  })
})

describe('messageText', () => {
  test('joins text blocks and ignores the rest', () => {
    expect(messageText({ content: [{ type: 'text', text: 'a' }, { type: 'image' }, { type: 'text', text: 'b' }] })).toBe('a\nb')
    expect(messageText(undefined)).toBe('')
  })
})
