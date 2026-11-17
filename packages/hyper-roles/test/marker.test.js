/**
 * The three rendered texts are what the model actually reads, so their shape is
 * a contract: the marker must be unambiguous, the per-step section must stay
 * small, and the brief must carry enough for a child to start without asking.
 */
import { describe, expect, test } from 'bun:test'

import { bindLine, clip, extractRole, paragraphOf, renderBrief, renderCard, renderRoster, renderSelf, scopeLabel } from '../src/marker.js'

const card = {
  scope: 'project',
  path: '/tmp/roles/reviewer.md',
  notesPath: '/tmp/roles/reviewer.notes.md',
  guidePath: '/tmp/roles/reviewer.guide.md',
  fields: {
    id: 'reviewer',
    title: '代码评审员',
    version: 3,
    capabilities: ['静态分析', '风险识别'],
    skills: ['dsh-bundle-authoring'],
    handoffs: ['implementer'],
    can: ['edit-roles'],
  },
  body: '## 职责\n对变更做风险分级，给出可执行的修复清单。\n\n## 工作方式\n先看测试。\n',
}

describe('marker', () => {
  test('round-trips the binding line', () => {
    expect(bindLine('reviewer')).toBe('<!-- role:reviewer -->')
    expect(extractRole(`前言\n${bindLine('reviewer')}\n任务`)).toBe('reviewer')
    expect(extractRole('没有标记')).toBeUndefined()
    expect(extractRole('<!-- role:Bad Id -->')).toBeUndefined()
  })
})

describe('renderSelf', () => {
  test('carries identity, duties, skills and handoffs', () => {
    const text = renderSelf(card, { guidePath: card.guidePath, noteCount: 4 })
    expect(text).toContain('## 你的岗位')
    expect(text).toContain('reviewer · 代码评审员')
    expect(text).toContain('对变更做风险分级')
    expect(text).toContain('技能：dsh-bundle-authoring')
    expect(text).toContain('交接：implementer')
    expect(text).toContain('经验条目：4 条')
  })

  test('respects the character budget', () => {
    const text = renderSelf(card, { maxChars: 60 })
    expect(text.length).toBeLessThanOrEqual(60)
  })
})

describe('renderBrief', () => {
  test('separates the role from the task and quotes recent notes', () => {
    const text = renderBrief(card, {
      notes: [{ at: '2026-11-01T00:00:00.000Z', source: 'lead', text: '只看 diff 不看全文件' }],
      guide: '- 先读 wiki 的评审约定',
      maxChars: 4000,
    })
    expect(text.startsWith('【岗位】代码评审员')).toBe(true)
    expect(text).toContain('最近经验')
    expect(text).toContain('只看 diff 不看全文件')
    expect(text.trimEnd().endsWith('---')).toBe(true)
  })
})

describe('renderCard', () => {
  test('includes the body, metadata and file paths', () => {
    const text = renderCard(card, { notes: [], maxChars: 4000 })
    expect(text).toContain('能力：静态分析、风险识别')
    expect(text).toContain('权限：edit-roles')
    expect(text).toContain('先看测试')
    expect(text).toContain('经验文件：/tmp/roles/reviewer.notes.md')
  })
})

describe('renderRoster', () => {
  test('lists roles with scope and collapses the tail', () => {
    const rows = Array.from({ length: 5 }, (_, index) => ({
      id: `role-${index}`,
      title: `岗位 ${index}`,
      scope: index % 2 === 0 ? 'project' : 'global',
      summary: '做点什么',
    }))
    const text = renderRoster(rows, { max: 3 })
    expect(text).toContain('- role-0 · 岗位 0（项目）')
    expect(text).toContain('另有 2 个岗位')
    expect(text).toContain('role_spawn')
  })

  test('returns nothing without roles', () => {
    expect(renderRoster([], { max: 10 })).toBe('')
  })
})

describe('helpers', () => {
  test('paragraphOf skips headings and stops at a blank line', () => {
    expect(paragraphOf('## 职责\n第一段。\n续行。\n\n第二段。')).toBe('第一段。 续行。')
    expect(paragraphOf('## 只有标题\n')).toBe('')
  })

  test('clip marks truncation', () => {
    expect(clip('abcdef', 4)).toBe('abc…')
    expect(clip('abc', 10)).toBe('abc')
  })

  test('scopeLabel covers every scope', () => {
    expect(scopeLabel('project')).toBe('项目')
    expect(scopeLabel('global')).toBe('全局')
    expect(scopeLabel('other')).toBe('未知作用域')
  })
})
