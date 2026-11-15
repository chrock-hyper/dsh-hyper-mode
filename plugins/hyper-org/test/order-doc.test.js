/**
 * The work-order grammar: what a stored order must look like, and what makes
 * one unreadable. Every tool decision downstream trusts these rules.
 */
import { describe, expect, test } from 'bun:test'

import { acceptanceGate, occupiesSlot, parseOrder, serializeOrder } from '../lib/order-doc.js'

const ORDER = {
  schemaVersion: 1,
  id: 'wo-20261115-1',
  title: '给岗位卡加模型字段',
  stage: 'active',
  size: 'M',
  dri: 'engineer',
  acceptance: ['role read 显示模型行', 'spawn 传 agentOptions'],
  artifacts: ['plugins/hyper-roles/lib/tools.js'],
  log: [{ at: '2026-11-15T02:00:00.000Z', by: 'lead', note: '建单' }],
  createdAt: '2026-11-15T02:00:00.000Z',
  updatedAt: '2026-11-15T02:00:00.000Z',
}

describe('parseOrder', () => {
  test('reads a stored order and round-trips it byte-stably', () => {
    const order = parseOrder(serializeOrder(ORDER))
    expect(order.id).toBe('wo-20261115-1')
    expect(order.dri).toBe('engineer')
    expect(order.acceptance).toHaveLength(2)
    expect(serializeOrder(order)).toBe(serializeOrder(parseOrder(serializeOrder(order))))
  })

  test('defaults the optional parts', () => {
    const order = parseOrder({ schemaVersion: 1, id: 'wo-20261115-2', title: '最小单' })
    expect(order.stage).toBe('intake')
    expect(order.size).toBe('M')
    expect(order.dri).toBeUndefined()
    expect(order.acceptance).toEqual([])
    expect(order.log).toEqual([])
  })

  test('rejects an unknown stage, size or id', () => {
    expect(() => parseOrder({ ...ORDER, stage: 'nope' })).toThrow(/unknown stage/)
    expect(() => parseOrder({ ...ORDER, size: 'XL' })).toThrow(/unknown size/)
    expect(() => parseOrder({ ...ORDER, id: 'order-1' })).toThrow(/invalid work order id/)
  })

  test('rejects a mangled schema version', () => {
    expect(() => parseOrder({ ...ORDER, schemaVersion: 2 })).toThrow(/schemaVersion/)
  })
})

describe('workflow predicates', () => {
  test('only active, review and blocked occupy a slot', () => {
    expect(occupiesSlot({ stage: 'active' })).toBe(true)
    expect(occupiesSlot({ stage: 'review' })).toBe(true)
    expect(occupiesSlot({ stage: 'intake' })).toBe(false)
    expect(occupiesSlot({ stage: 'done' })).toBe(false)
  })

  test('medium and large work needs acceptance criteria; small work does not', () => {
    expect(acceptanceGate({ size: 'S', acceptance: [] })).toBe(true)
    expect(acceptanceGate({ size: 'M', acceptance: [] })).toBe(false)
    expect(acceptanceGate({ size: 'L', acceptance: ['一句话也算'] })).toBe(true)
  })
})
