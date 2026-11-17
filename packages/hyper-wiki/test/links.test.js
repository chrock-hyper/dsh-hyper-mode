import { describe, expect, test } from 'bun:test'

import { backlinksOf, extractLinks, resolveLink } from '../src/links.js'

describe('relative link normalization', () => {
  test('resolves sibling, nested, and parent-relative links', () => {
    expect(resolveLink('./guide/setup.md', 'index.md')).toBe('guide/setup.md')
    expect(resolveLink('guide/setup.md', 'index.md')).toBe('guide/setup.md')
    expect(resolveLink('./term.md', 'guide/setup.md')).toBe('guide/term.md')
    expect(resolveLink('../term.md', 'guide/setup.md')).toBe('term.md')
    expect(resolveLink('../a/b.md', 'guide/deep/x.md')).toBe('guide/a/b.md')
  })

  test('keeps Chinese ids and strips anchors and queries', () => {
    expect(resolveLink('./指南/术语.md', 'index.md')).toBe('指南/术语.md')
    expect(resolveLink('./term.md#定义', 'index.md')).toBe('term.md')
    expect(resolveLink('./term.md?x=1', 'index.md')).toBe('term.md')
  })

  test('ignores everything that is not a page link', () => {
    for (const target of [
      'https://example.com/a.md',
      'http://example.com/a.md',
      'mailto:me@example.com',
      '//cdn.example.com/a.md',
      '/absolute/a.md',
      '#anchor',
      'page.txt',
      'drafts/secret.md',
      '.trash/old.md',
      '../../escape.md',
      '',
    ]) {
      expect(resolveLink(target, 'index.md')).toBeUndefined()
    }
  })
})

describe('link extraction', () => {
  test('extracts unique targets in document order', () => {
    const body = [
      'See [setup](./guide/setup.md) and [再次](./guide/setup.md).',
      'Also [term](term.md).',
    ].join('\n')
    expect(extractLinks(body, 'index.md')).toEqual(['guide/setup.md', 'term.md'])
  })

  test('ignores images, external links, inline code, and fenced code', () => {
    const body = [
      '![logo](./logo.md)',
      '[ext](https://example.com/x.md)',
      '`[code](./inline.md)`',
      '```',
      '[fenced](./fenced.md)',
      '```',
      '[real](./real.md)',
    ].join('\n')
    expect(extractLinks(body, 'index.md')).toEqual(['real.md'])
  })
})

describe('backlinks', () => {
  const pages = [
    { path: 'index.md', title: '首页', body: 'See [setup](./guide/setup.md).' },
    { path: 'guide/setup.md', title: '安装', body: 'Back to [home](../index.md).' },
    { path: 'guide/term.md', title: '术语', body: 'See [setup](./setup.md).' },
    { path: 'other.md', title: '其它', body: 'Nothing here.' },
  ]

  test('lists every page that links to the target, sorted by path', () => {
    expect(backlinksOf(pages, 'guide/setup.md')).toEqual([
      { path: 'guide/term.md', title: '术语' },
      { path: 'index.md', title: '首页' },
    ])
    expect(backlinksOf(pages, 'other.md')).toEqual([])
  })

  test('never reports the target as its own backlink', () => {
    const self = [{ path: 'a.md', title: 'A', body: '[self](./a.md)' }]
    expect(backlinksOf(self, 'a.md')).toEqual([])
  })
})
