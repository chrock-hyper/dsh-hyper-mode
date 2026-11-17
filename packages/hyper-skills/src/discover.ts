/**
 * 发现本 bundle 各包随包的 skill。
 *
 * @module @chrock-studio/dsh-hyper-skills/discover
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { parseSkillFile } from './frontmatter.ts'

/** One installable skill discovered inside a package's `skills/` directory. */
export interface BundledSkill {
  name: string
  description: string
  /** Owning package directory name, e.g. `hyper-wiki`. */
  plugin: string
  /** Absolute source path: the skill directory, or the flat `.md` file. */
  source: string
  /** True for a directory bundle (`<name>/SKILL.md`), false for a flat file. */
  directory: boolean
}

/**
 * List the skills shipped by this bundle's packages.
 *
 * Scans `<packages root>/<package>/skills/` one level deep: a directory bundle
 * `/<name>/SKILL.md` or a flat `/<name>.md`. Nested trees are deliberately
 * ignored, matching `skill-filesystem`'s discovery contract.
 * @param packagesRoot - absolute path of the workspace packages directory.
 * @returns sorted installable skills, each with its owning package and source path.
 */
export function discoverSkills(packagesRoot: string): BundledSkill[] {
  let packageEntries
  try {
    packageEntries = readdirSync(packagesRoot, { withFileTypes: true })
  } catch {
    return []
  }
  const skills: BundledSkill[] = []
  for (const pkg of packageEntries) {
    if (!pkg.isDirectory() || pkg.name.startsWith('.')) continue
    const skillsDir = join(packagesRoot, pkg.name, 'skills')
    let entries
    try {
      entries = readdirSync(skillsDir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      let file: string
      let source: string
      let directory = false
      if (entry.isDirectory()) {
        file = join(skillsDir, entry.name, 'SKILL.md')
        source = join(skillsDir, entry.name)
        directory = true
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        file = join(skillsDir, entry.name)
        source = file
      } else {
        continue
      }
      if (!existsSync(file)) continue
      const parsed = parseSkillFile(file)
      if (!parsed) continue
      skills.push({ ...parsed, plugin: pkg.name, source, directory })
    }
  }
  return skills.sort((left, right) => left.name.localeCompare(right.name))
}
