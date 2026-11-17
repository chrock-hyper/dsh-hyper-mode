/**
 * Store behaviour: scope precedence, optimistic concurrency, and the promise
 * that archiving never destroys a card.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  appendNote,
  archiveRole,
  createRole,
  listRoles,
  parseNotes,
  readGuide,
  readNotes,
  readRole,
  readRoleIn,
  saveRole,
  writeGuide,
} from '../src/store.ts'

const root = mkdtempSync(join(tmpdir(), 'hyper-roles-store-'))
const dirs = {
  home: root,
  globalDir: join(root, 'global'),
  projectRoot: root,
  projectDir: join(root, 'project'),
}

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('scope resolution', () => {
  test('creates in project scope and reads it back', () => {
    const card = createRole(dirs, { scope: 'project', id: 'reviewer', title: '评审', body: '## 职责\n看风险。' })
    expect(card.scope).toBe('project')
    expect(card.fields.version).toBe(1)
    expect(readRole(dirs, 'reviewer').scope).toBe('project')
    expect(readFileSync(card.path, 'utf8')).toContain('title: 评审')
  })

  test('project shadows a global card of the same id', () => {
    createRole(dirs, { scope: 'global', id: 'reviewer', title: '全局评审', body: '' })
    const resolved = readRole(dirs, 'reviewer')
    expect(resolved.scope).toBe('project')
    expect(resolved.shadowed).toBe(true)
    const listed = listRoles(dirs)
    expect(listed.global.find((row) => row.id === 'reviewer').shadowed).toBe(true)
    expect(listed.project.find((row) => row.id === 'reviewer').shadowed).toBeFalsy()
  })

  test('refuses a project scope without a project root', () => {
    const globalOnly = { home: root, globalDir: join(root, 'global2') }
    expect(() => createRole(globalOnly, { scope: 'project', id: 'x1', title: 'X' })).toThrow(/no project root/)
  })

  test('rejects an id that could escape the scope directory', () => {
    expect(() => readRoleIn(dirs, 'project', '../escape')).toThrow(/invalid role id/)
  })
})

describe('save', () => {
  test('bumps the version and refuses a stale write', () => {
    const saved = saveRole(dirs, { id: 'reviewer', body: '## 职责\n看风险与回归。', expectedVersion: 1 })
    expect(saved.fields.version).toBe(2)
    expect(() => saveRole(dirs, { id: 'reviewer', body: 'x', expectedVersion: 1 })).toThrow(/changed since/)
    try {
      saveRole(dirs, { id: 'reviewer', body: 'x', expectedVersion: 1 })
    } catch (error) {
      expect(error.code).toBe('stale')
      expect(error.currentVersion).toBe(2)
    }
  })

  test('merges partial fields instead of dropping them', () => {
    const saved = saveRole(dirs, { id: 'reviewer', fields: { capabilities: ['回归'] }, expectedVersion: 2 })
    expect(saved.fields.capabilities).toEqual(['回归'])
    expect(saved.fields.title).toBe('评审')
  })
})

describe('notes and guide', () => {
  test('appends timestamped entries and parses them back', () => {
    appendNote(dirs, { id: 'reviewer', text: '只在 diff 超过 400 行时才要求拆 PR', source: 'lead' })
    appendNote(dirs, { id: 'reviewer', text: '先看测试再看实现', source: 'reviewer' })
    const { entries, scope } = readNotes(dirs, 'reviewer')
    expect(scope).toBe('project')
    expect(entries.length).toBe(2)
    expect(entries[0].source).toBe('lead')
    expect(entries[1].text).toBe('先看测试再看实现')
    expect(entries[0].at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  test('writes and reads the reading guide', () => {
    writeGuide(dirs, { id: 'reviewer', text: '- 先读 wiki 的评审约定\n' })
    expect(readGuide(dirs, 'reviewer').text).toContain('评审约定')
  })

  test('parseNotes ignores empty input', () => {
    expect(parseNotes('')).toEqual([])
  })
})

describe('archive', () => {
  test('moves card, notes and guide without losing them', () => {
    const target = archiveRole(dirs, { id: 'reviewer' })
    expect(existsSync(target)).toBe(true)
    expect(readRoleIn(dirs, 'project', 'reviewer')).toBeUndefined()
    expect(existsSync(join(target, 'reviewer.md'))).toBe(true)
    expect(existsSync(join(target, 'reviewer.notes.md'))).toBe(true)
  })

  test('falls back to the remaining global copy after the project card is archived', () => {
    const resolved = readRole(dirs, 'reviewer')
    expect(resolved.scope).toBe('global')
    expect(resolved.shadowed).toBe(false)
  })

  test('records every mutation in a changelog', () => {
    const changelog = readFileSync(join(dirs.projectDir, 'CHANGELOG.md'), 'utf8')
    expect(changelog).toContain('reviewer v1 created')
    expect(changelog).toContain('archived')
  })
})
