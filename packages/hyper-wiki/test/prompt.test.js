import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'

import { callerName, normalizeConfig, readBundledSkill, workingDirectoryOf } from '../src/index.js'
import { CONFIG_DEFAULTS } from '../src/index.js'
import { wikiFacts, wikiPromptText, WIKI_SECTION_ORDER } from '../src/prompt.js'
import { serializePage } from '../src/page.js'
import { makeEnv, write } from './helpers.js'

/** A page document used where only presence matters. */
const PAGE = serializePage({ title: 'x', body: 'y' })

describe('prompt text', () => {
  test('is empty when neither scope holds a wiki', () => {
    expect(wikiPromptText({ global: { exists: false }, project: { exists: false } })).toBe('')
    expect(wikiPromptText({ global: { exists: false } })).toBe('')
    expect(wikiPromptText(undefined)).toBe('')
  })

  test('names the paths, the tool, the draft rule, and the link syntax', () => {
    const text = wikiPromptText({
      global: { exists: true, wiki: '/home/u/.dsh/wiki', contract: '/home/u/.dsh/wiki.md' },
      project: { exists: true, wiki: '/repo/.dsh/wiki', contract: '/repo/.dsh/wiki.md' },
    })
    const lines = text.split('\n')
    expect(lines.length).toBeLessThanOrEqual(4)
    expect(text).toContain('/home/u/.dsh/wiki')
    expect(text).toContain('/repo/.dsh/wiki')
    expect(text).toContain('`wiki`')
    expect(text).toContain('"draft"')
    expect(text).toContain('Wiki panel')
    expect(text).toContain('[term](./guide/term.md)')
  })

  test('mentions the project store only when it exists', () => {
    const text = wikiPromptText({
      global: { exists: true, wiki: '/g/wiki', contract: '/g/wiki.md' },
      project: { exists: false, wiki: '/p/.dsh/wiki', contract: '/p/.dsh/wiki.md' },
    })
    expect(text).toContain('/g/wiki')
    expect(text).not.toContain('/p/.dsh/wiki')
  })

  test('keeps a stable section placement', () => {
    expect(WIKI_SECTION_ORDER).toBeGreaterThan(3000)
  })
})

describe('prompt facts', () => {
  test('resolve both scopes from a session directory', () => {
    const env = makeEnv()
    write(join(env.home, 'wiki', 'a.md'), PAGE)
    const facts = wikiFacts({ scopes: env.scopes, cwd: env.workspace })
    expect(facts.global.exists).toBe(true)
    expect(facts.global.wiki).toBe(join(env.home, 'wiki'))
    expect(facts.project.exists).toBe(false)
    expect(facts.project.wiki).toBe(join(env.project, '.dsh', 'wiki'))
  })

  test('drop the project scope without a directory', () => {
    const env = makeEnv()
    expect(wikiFacts({ scopes: env.scopes, cwd: undefined }).project).toBeUndefined()
  })
})

describe('caller identity', () => {
  test('reads the subagent name and falls back to agent', () => {
    const ctx = { get: name => (name === 'subagents' ? { namesOf: () => ({ self: 'wiki-builder' }) } : undefined) }
    expect(callerName(ctx, { session: 's' })).toBe('wiki-builder')
    expect(callerName(ctx, undefined)).toBe('agent')
    const throwing = { get: () => ({ namesOf: () => { throw new Error('gone') } }) }
    expect(callerName(throwing, {})).toBe('agent')
    const empty = { get: () => ({ namesOf: () => ({}) }) }
    expect(callerName(empty, {})).toBe('agent')
  })

  test('reads the session working directory without throwing', () => {
    const ctx = { get: name => (name === 'workingDirectory' ? { get: () => '/work/dir' } : undefined) }
    expect(workingDirectoryOf(ctx, { session: 's' })).toBe('/work/dir')
    expect(workingDirectoryOf({ get: () => ({ get: () => { throw new Error('nope') } }) }, { session: 's' })).toBeUndefined()
    expect(workingDirectoryOf({}, { session: 's' })).toBeUndefined()
    expect(workingDirectoryOf(ctx, undefined)).toBeUndefined()
  })
})

describe('config', () => {
  test('defaults every knob', () => {
    expect(normalizeConfig(undefined)).toEqual(CONFIG_DEFAULTS)
    expect(normalizeConfig('nonsense')).toEqual(CONFIG_DEFAULTS)
  })

  test('accepts valid overrides and clamps numbers', () => {
    const resolved = normalizeConfig({
      prompt: false,
      git: false,
      skill: false,
      gitBin: ' /usr/local/bin/git ',
      maxResults: 0,
      recentProjects: 500,
      home: '/tmp/custom-home',
    })
    expect(resolved.prompt).toBe(false)
    expect(resolved.git).toBe(false)
    expect(resolved.skill).toBe(false)
    expect(resolved.gitBin).toBe('/usr/local/bin/git')
    expect(resolved.maxResults).toBe(1)
    expect(resolved.recentProjects).toBe(50)
    expect(resolved.home).toBe('/tmp/custom-home')
  })

  test('ignores values of the wrong type instead of failing', () => {
    const resolved = normalizeConfig({ prompt: 'yes', git: 1, maxResults: 'many', home: 'relative/path' })
    expect(resolved.prompt).toBe(CONFIG_DEFAULTS.prompt)
    expect(resolved.git).toBe(CONFIG_DEFAULTS.git)
    expect(resolved.maxResults).toBe(CONFIG_DEFAULTS.maxResults)
    expect(resolved.home).toBeUndefined()
  })
})

describe('bundled skill', () => {
  test('reads the shipped SKILL.md with its frontmatter fields', () => {
    const skill = readBundledSkill()
    expect(skill).toBeDefined()
    expect(skill.name).toBe('wiki-draft-review')
    expect(skill.description.length).toBeGreaterThan(30)
    expect(skill.whenToUse).toContain('draft')
    expect(skill.content).toContain('action: "draft"')
    expect(skill.source).toBe('runtime')
    expect(skill.content.startsWith('---')).toBe(false)
  })

  test('returns undefined for a missing or malformed file', () => {
    const env = makeEnv()
    expect(readBundledSkill(new URL('file:///definitely/missing/SKILL.md'))).toBeUndefined()
    const file = join(env.home, 'SKILL.md')
    write(file, 'no frontmatter here')
    expect(readBundledSkill(new URL(`file://${file}`))).toBeUndefined()
  })
})
