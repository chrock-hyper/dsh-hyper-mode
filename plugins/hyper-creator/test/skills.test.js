/**
 * Guards the preset's shipped skills: the directory must be wired into the
 * patch, and every SKILL.md must carry frontmatter the filesystem provider
 * accepts (name matching the directory, non-empty description). Both failure
 * modes are silent at runtime — a bad root is skipped, a bad file is warned
 * about and ignored — so assert them here instead.
 */
import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const pluginDir = dirname(dirname(fileURLToPath(import.meta.url)))
const skillsDir = join(pluginDir, 'skills')
const patch = readFileSync(join(pluginDir, '..', '..', 'cordis.patch.yml'), 'utf8')

/** Frontmatter the provider requires: `name` plus `description`. */
function frontmatter(body) {
  const block = body.match(/^---\n([\s\S]*?)\n---\n/)
  if (!block) throw new Error('missing YAML frontmatter')
  const name = /^name:[ \t]*(.+)$/m.exec(block[1])?.[1].trim()
  const description = /^description:[ \t]*(.+)$/m.exec(block[1])?.[1].trim()
  return { name, description }
}

describe('preset skills', () => {
  const names = readdirSync(skillsDir).filter((n) => existsSync(join(skillsDir, n, 'SKILL.md')))

  test('the skill root is anchored to this package in the patch', () => {
    expect(patch).toContain("path.join(dir, 'plugins', 'hyper-creator', 'skills')")
  })

  test('ships the preset and bundle authoring skills', () => {
    expect(names).toContain('dsh-preset-authoring')
    expect(names).toContain('dsh-bundle-authoring')
  })

  test('every SKILL.md passes the provider frontmatter rules', () => {
    expect(names.length).toBeGreaterThan(0)
    for (const dir of names) {
      const { name, description } = frontmatter(readFileSync(join(skillsDir, dir, 'SKILL.md'), 'utf8'))
      expect(name).toBe(dir)
      expect(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)).toBe(true)
      expect((description ?? '').length).toBeGreaterThan(20)
    }
  })
})
