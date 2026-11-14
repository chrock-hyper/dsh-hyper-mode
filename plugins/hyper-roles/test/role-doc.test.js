/**
 * The role-card grammar is what the panel, the tools and hand-written files all
 * share, so the parser's tolerance and its rejections are both contracts.
 */
import { describe, expect, test } from 'bun:test'

import { normalizeFields, parseList, parseRoleDoc, serializeRoleDoc } from '../lib/role-doc.js'

const CARD = `---
id: reviewer
title: 代码评审员
version: 3
capabilities: 静态分析, 风险识别
skills: dsh-bundle-authoring
handoffs: implementer, architect
can: edit-roles
---
## 职责
对变更做风险分级，给出可执行的修复清单。
`

describe('parseRoleDoc', () => {
  test('reads every field and keeps the body', () => {
    const { fields, body } = parseRoleDoc(CARD)
    expect(fields.id).toBe('reviewer')
    expect(fields.title).toBe('代码评审员')
    expect(fields.version).toBe(3)
    expect(fields.capabilities).toEqual(['静态分析', '风险识别'])
    expect(fields.skills).toEqual(['dsh-bundle-authoring'])
    expect(fields.handoffs).toEqual(['implementer', 'architect'])
    expect(fields.can).toEqual(['edit-roles'])
    expect(body).toContain('## 职责')
  })

  test('defaults version and optional lists', () => {
    const { fields } = parseRoleDoc('---\nid: helper\ntitle: 助手\n---\n正文\n')
    expect(fields.version).toBe(1)
    expect(fields.capabilities).toEqual([])
    expect(fields.handoffs).toEqual([])
  })

  test('accepts quoted titles containing a colon', () => {
    const { fields } = parseRoleDoc('---\nid: helper\ntitle: "评审: 只读"\n---\n')
    expect(fields.title).toBe('评审: 只读')
  })

  test('accepts folded scalars', () => {
    const { fields } = parseRoleDoc('---\nid: helper\ntitle: >\n  代码\n  评审员\n---\n')
    expect(fields.title).toBe('代码 评审员')
  })

  test('rejects a missing or invalid id, and unknown grants', () => {
    expect(() => parseRoleDoc('---\ntitle: 无 id\n---\n')).toThrow(/needs an "id"/)
    expect(() => parseRoleDoc('---\nid: Bad_Id\ntitle: 坏 id\n---\n')).toThrow(/lowercase/)
    expect(() => parseRoleDoc('---\nid: helper\ntitle: 助手\ncan: delete-everything\n---\n')).toThrow(/unknown grant/)
  })

  test('rejects a file without frontmatter', () => {
    expect(() => parseRoleDoc('## 只有正文\n')).toThrow(/frontmatter/)
  })

  test('tolerates BOM and CRLF', () => {
    const text = `\uFEFF${CARD.replace(/\n/g, '\r\n')}`
    expect(parseRoleDoc(text).fields.id).toBe('reviewer')
  })
})

describe('serializeRoleDoc', () => {
  test('round-trips a card byte-stably', () => {
    const first = serializeRoleDoc({ fields: normalizeFields({
      id: 'reviewer',
      title: '代码评审员',
      capabilities: ['静态分析', '风险识别'],
      skills: ['dsh-bundle-authoring'],
      handoffs: ['implementer'],
      can: ['edit-roles'],
    }), body: '## 职责\n对变更做风险分级。' })
    const again = serializeRoleDoc(parseRoleDoc(first))
    expect(again).toBe(first)
    expect(parseRoleDoc(first).fields.capabilities).toEqual(['静态分析', '风险识别'])
  })

  test('quotes a title that YAML would misread', () => {
    const text = serializeRoleDoc({ fields: normalizeFields({ id: 'x1', title: '#1 评审' }), body: '' })
    expect(text).toContain('title: "#1 评审"')
    expect(parseRoleDoc(text).fields.title).toBe('#1 评审')
  })
})

describe('parseList', () => {
  test('splits, trims, drops empties and de-duplicates', () => {
    expect(parseList(' a , b ,, a ')).toEqual(['a', 'b'])
    expect(parseList(['x', ' x ', 'y'])).toEqual(['x', 'y'])
    expect(parseList(undefined)).toEqual([])
  })
})
