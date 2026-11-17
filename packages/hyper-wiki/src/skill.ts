/**
 * The bundled `wiki-draft-review` skill descriptor.
 *
 * The skill is read from this package's `skills/` directory through URLs
 * resolved from this module, so it must stay at the same depth as the package
 * entry (`src/`). A missing or malformed file is reported by the caller, never
 * thrown.
 *
 * @module @chrock-studio/dsh-hyper-wiki/skill
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { splitFrontmatter } from './page.ts'

/** The bundled skill's instruction file and its resource directory. */
const SKILL_FILE = new URL('../skills/wiki-draft-review/SKILL.md', import.meta.url)
const SKILL_DIR = new URL('../skills/wiki-draft-review/', import.meta.url)

/** The skill registration fields the Host accepts. */
export interface SkillRegistration {
  name: string
  description: string
  whenToUse?: string
  content: string
  source: string
  resourceBase: { kind: 'directory'; path: string }
}

/**
 * Read the bundled review skill.
 * @param file - the skill instruction file.
 * @returns the skill registration fields, or undefined when the file is
 *   missing or malformed.
 */
export function readBundledSkill(file: URL = SKILL_FILE): SkillRegistration | undefined {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return undefined
  }
  const { fields, body } = splitFrontmatter(text)
  const skillName = typeof fields.name === 'string' ? fields.name : ''
  const description = typeof fields.description === 'string' ? fields.description : ''
  if (skillName === '' || description === '') return undefined
  return {
    name: skillName,
    description,
    ...(typeof fields.whenToUse === 'string' && fields.whenToUse !== '' ? { whenToUse: fields.whenToUse } : {}),
    content: body,
    source: 'runtime',
    resourceBase: { kind: 'directory', path: fileURLToPath(SKILL_DIR) },
  }
}
