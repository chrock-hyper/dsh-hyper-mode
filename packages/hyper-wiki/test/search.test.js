import { describe, expect, test } from 'bun:test'

import { parsePage } from '../src/page.js'
import { DEFAULT_LIMIT, SEARCH_WEIGHTS, scorePage, searchPages } from '../src/search.js'

/**
 * Build one parsed page row.
 * @param path - page id.
 * @param text - page document.
 * @param scope - owning scope name.
 * @returns the row search expects.
 */
function row(path, text, scope = 'global') {
  return { ...parsePage(text), path, scope }
}

describe('search weights', () => {
  test('title outranks tags and the file name, which share a weight', () => {
    const byTitle = row('guide/one.md', '---\ntitle: deploy notes\n---\n\nbody')
    const byTags = row('guide/two.md', '---\ntitle: other\ntags: deploy\n---\n\nbody')
    const byName = row('guide/deploy.md', '---\ntitle: other\n---\n\nbody')
    expect(scorePage(byTitle, 'deploy')).toBe(SEARCH_WEIGHTS.title)
    expect(scorePage(byTags, 'deploy')).toBe(SEARCH_WEIGHTS.tags)
    expect(scorePage(byName, 'deploy')).toBe(SEARCH_WEIGHTS.name)
    expect(scorePage(byTitle, 'deploy')).toBeGreaterThan(scorePage(byTags, 'deploy'))
    // Tags and the file name share a weight by design.
    expect(scorePage(byTags, 'deploy')).toBe(scorePage(byName, 'deploy'))
  })

  test('sums every matching field', () => {
    const page = row('guide/deploy.md', '---\ntitle: deploy guide\ntags: deploy\n---\n\nbody')
    expect(scorePage(page, 'deploy')).toBe(SEARCH_WEIGHTS.title + SEARCH_WEIGHTS.tags + SEARCH_WEIGHTS.name)
  })

  test('matches Chinese substrings in titles and tags', () => {
    const page = row('guide/术语.md', '---\ntitle: 术语表\ntags: 约定\n---\n\nbody')
    expect(scorePage(page, '术语')).toBeGreaterThan(0)
    expect(scorePage(page, '约定')).toBe(SEARCH_WEIGHTS.tags)
  })

  test('is case-insensitive for English and does not search the body', () => {
    const page = row('guide/one.md', '---\ntitle: Deploy Guide\n---\n\nDEPLOY in the body only')
    expect(scorePage(page, 'deploy')).toBe(SEARCH_WEIGHTS.title)
    expect(scorePage(row('guide/two.md', '---\ntitle: other\n---\n\nDEPLOY only'), 'deploy')).toBe(0)
    expect(scorePage(page, '   ')).toBe(0)
  })
})

describe('search ranking', () => {
  test('sorts by score then path', () => {
    const pages = [
      row('b.md', '---\ntitle: other\ntags: deploy\n---\n\nbody'),
      row('a.md', '---\ntitle: deploy\n---\n\nbody'),
      row('c.md', '---\ntitle: other\n---\n\ndeploy in body'),
      row('d.md', '---\ntitle: deploy\n---\n\nbody'),
    ]
    const hits = searchPages(pages, 'deploy')
    expect(hits.map(hit => hit.path)).toEqual(['a.md', 'd.md', 'b.md'])
    expect(hits[0].score).toBe(SEARCH_WEIGHTS.title)
    expect(hits[2].score).toBe(SEARCH_WEIGHTS.tags)
  })

  test('caps results at the limit and defaults to 20', () => {
    const pages = Array.from({ length: 30 }, (_, index) => row(`p${index}.md`, '---\ntitle: deploy\n---\n\nbody'))
    expect(searchPages(pages, 'deploy').length).toBe(DEFAULT_LIMIT)
    expect(DEFAULT_LIMIT).toBe(20)
    expect(searchPages(pages, 'deploy', 5).length).toBe(5)
  })

  test('returns the public summary shape', () => {
    const pages = [row('guide/setup.md', '---\ntitle: 安装\ntags: a, b\nstatus: stable\nupdated: 2026-11-15\n---\n\nbody')]
    expect(searchPages(pages, '安装')).toEqual([
      {
        scope: 'global',
        path: 'guide/setup.md',
        title: '安装',
        tags: ['a', 'b'],
        status: 'stable',
        updated: '2026-11-15',
        score: SEARCH_WEIGHTS.title,
      },
    ])
  })

  test('labels an illegal status instead of inventing one', () => {
    const pages = [row('x.md', '---\ntitle: x\nstatus: broken\n---\n\nbody')]
    expect(searchPages(pages, 'x')[0].status).toBe('broken')
    expect(searchPages([row('y.md', '---\ntitle: y\n---\n\nbody')], 'y')[0].status).toBe('unknown')
  })
})
