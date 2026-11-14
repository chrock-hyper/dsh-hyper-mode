import { describe, expect, test } from 'bun:test'

import {
  displayTitle,
  isoTimestamp,
  normalizePagePath,
  normalizeTags,
  parsePage,
  serializePage,
  sha1Hex,
  splitFrontmatter,
} from '../lib/page.js'

describe('page frontmatter', () => {
  test('parses Chinese title, tags, status and updated', () => {
    const page = parsePage([
      '---',
      'title: 术语表',
      'tags: 术语, 约定',
      'status: stable',
      'updated: 2026-11-15',
      '---',
      '',
      '# 术语',
      '',
      '页面正文。',
    ].join('\n'))
    expect(page.title).toBe('术语表')
    expect(page.tags).toEqual(['术语', '约定'])
    expect(page.status).toBe('stable')
    expect(page.updated).toBe('2026-11-15')
    expect(page.body).toBe('# 术语\n\n页面正文。')
    expect(page.errors).toEqual([])
  })

  test('unquotes quoted scalars and keeps colons inside them', () => {
    const page = parsePage('---\ntitle: "安装: 第一步"\ntags: "a, b"\n---\n\nbody')
    expect(page.title).toBe('安装: 第一步')
    expect(page.tags).toEqual(['a', 'b'])
  })

  test('round-trips through serialize without changing the body', () => {
    const original = {
      title: 'Guide: 快速开始',
      tags: ['guide', '中文'],
      status: 'wip',
      updated: '2026-11-15',
      body: '# Head\n\nline one\nline two\n',
    }
    const first = serializePage(original)
    const parsed = parsePage(first)
    expect(parsed.title).toBe(original.title)
    expect(parsed.tags).toEqual(original.tags)
    expect(parsed.status).toBe('wip')
    expect(parsed.body).toBe(original.body)
    const second = serializePage({ ...parsed, body: parsed.body })
    expect(second).toBe(first)
  })

  test('accepts CRLF and a UTF-8 BOM', () => {
    const text = '\uFEFF---\r\ntitle: CRLF 页面\r\ntags: a, b\r\nstatus: wip\r\n---\r\n\r\nbody line\r\n'
    const page = parsePage(text)
    expect(page.title).toBe('CRLF 页面')
    expect(page.tags).toEqual(['a', 'b'])
    expect(page.body).toBe('body line\n')
    expect(page.errors).toEqual([])
  })

  test('reports an illegal status without discarding the page', () => {
    const page = parsePage('---\ntitle: bad\nstatus: broken\n---\n\nbody')
    expect(page.status).toBe('broken')
    expect(page.errors.some(line => line.includes('invalid status'))).toBe(true)
    expect(page.body).toBe('body')
  })

  test('reports a malformed updated value', () => {
    const page = parsePage('---\ntitle: x\nupdated: yesterday\n---\n\nbody')
    expect(page.errors.some(line => line.includes('invalid updated'))).toBe(true)
  })

  test('treats a document without frontmatter as pure body', () => {
    const page = parsePage('# Just body\n\ntext')
    expect(page.hasFrontmatter).toBe(false)
    expect(page.title).toBe('')
    expect(page.body).toBe('# Just body\n\ntext')
  })

  test('reports an unterminated frontmatter block', () => {
    const page = parsePage('---\ntitle: x\n\nbody')
    expect(page.hasFrontmatter).toBe(false)
    expect(page.errors.some(line => line.includes('closing'))).toBe(true)
  })

  test('parses a nested draft block inside the same frontmatter', () => {
    const { fields } = splitFrontmatter([
      '---',
      'title: x',
      'draft:',
      '  status: pending',
      '  author: lead',
      '  base: new',
      '---',
      '',
      'body',
    ].join('\n'))
    expect(fields.draft).toEqual({ status: 'pending', author: 'lead', base: 'new' })
  })

  test('normalizes tags from a bracketed list and drops duplicates', () => {
    expect(normalizeTags('[a, b, a]')).toEqual(['a', 'b'])
    expect(normalizeTags('')).toEqual([])
    expect(normalizeTags(undefined)).toEqual([])
  })

  test('hashes the body, not the frontmatter', () => {
    const left = parsePage('---\ntitle: a\n---\n\nsame body')
    const right = parsePage('---\ntitle: b\n---\n\nsame body')
    expect(sha1Hex(left.body)).toBe(sha1Hex(right.body))
    expect(sha1Hex(parsePage('---\ntitle: a\n---\n\nother').body)).not.toBe(sha1Hex(left.body))
  })

  test('falls back to the file stem for a missing title', () => {
    expect(displayTitle(parsePage('body'), 'guide/setup.md')).toBe('setup')
  })

  test('formats the local calendar date in ISO form', () => {
    // Built from local components, so the assertion holds in every timezone.
    expect(isoTimestamp(new Date(2026, 10, 15, 3, 4, 5))).toBe('2026-11-15')
    expect(isoTimestamp(new Date(2026, 0, 2, 23, 59, 59))).toBe('2026-01-02')
  })
})

describe('page paths', () => {
  test('accepts nested ids with Chinese and hyphens, with or without .md', () => {
    expect(normalizePagePath('guide/setup')).toEqual({ ok: true, path: 'guide/setup.md' })
    expect(normalizePagePath('指南/术语-表.md')).toEqual({ ok: true, path: '指南/术语-表.md' })
    expect(normalizePagePath('./a.md')).toEqual({ ok: true, path: 'a.md' })
  })

  test('rejects reserved prefixes, dot segments, traversal, and absolute paths', () => {
    for (const bad of ['drafts/x.md', '.trash/x.md', '.hidden/x.md', '../x.md', 'a/../b.md', '/abs.md', 'a//b.md', '']) {
      const result = normalizePagePath(bad)
      expect(result.ok).toBe(false)
    }
  })

  test('reserves only the draft and trash directories, not page files named like them', () => {
    // A nested `drafts` directory is an ordinary page directory.
    expect(normalizePagePath('guides/drafts/note.md')).toEqual({ ok: true, path: 'guides/drafts/note.md' })
    // `drafts.md` is a page file at the root, which the reserved directory never is.
    expect(normalizePagePath('drafts.md')).toEqual({ ok: true, path: 'drafts.md' })
    // The reserved directories themselves are never page ids.
    expect(normalizePagePath('drafts/').ok).toBe(false)
    expect(normalizePagePath('.trash/').ok).toBe(false)
  })

  test('rejects NUL and over-long segments', () => {
    expect(normalizePagePath('a\u0000b.md').ok).toBe(false)
    expect(normalizePagePath(`${'x'.repeat(120)}.md`).ok).toBe(false)
  })
})
