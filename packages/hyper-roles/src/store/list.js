/**
 * Listing roles across both scopes: the read projection the catalog, roster
 * and panel all share.
 *
 * @module @chrock-studio/dsh-hyper-roles/store/list
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parseRoleDoc, ROLE_ID } from '../role-doc.js'
import { GUIDE_SUFFIX, NOTES_SUFFIX } from './paths.js'
import { firstParagraph } from './text.js'

/**
 * List the roles of both scopes.
 * @param dirs - resolved scope directories.
 * @returns parsed rows per scope, plus unreadable files as problems.
 */
export function listRoles(dirs) {
  const global = readDir(dirs.globalDir, 'global')
  const project = dirs.projectDir === undefined ? { rows: [], problems: [] } : readDir(dirs.projectDir, 'project')
  const shadowed = new Set(project.rows.map((row) => row.id))
  return {
    global: global.rows.map((row) => ({ ...row, shadowed: shadowed.has(row.id) })),
    project: project.rows,
    problems: [...global.problems, ...project.problems],
  }
}

/**
 * Read one scope directory's role cards.
 * @param dir - scope directory, possibly absent.
 * @param scope - label stored on every row.
 * @returns rows sorted by id, and files that failed to parse.
 */
function readDir(dir, scope) {
  const rows = []
  const problems = []
  let names
  try {
    names = readdirSync(dir)
  } catch {
    return { rows, problems }
  }
  for (const name of names.sort()) {
    if (!name.endsWith('.md') || name.endsWith(NOTES_SUFFIX) || name.endsWith(GUIDE_SUFFIX)) continue
    const id = name.slice(0, -'.md'.length)
    if (!ROLE_ID.test(id)) continue
    const path = join(dir, name)
    try {
      const { fields, body } = parseRoleDoc(readFileSync(path, 'utf8'))
      rows.push({ ...summarize(fields, body), scope, path })
    } catch (error) {
      problems.push({ scope, path, message: error instanceof Error ? error.message : String(error) })
    }
  }
  return { rows, problems }
}

/**
 * Build the list projection of one card.
 * @param fields - parsed fields.
 * @param body - card body.
 * @returns the row the panel and roster use.
 */
export function summarize(fields, body) {
  return {
    id: fields.id,
    title: fields.title,
    version: fields.version,
    capabilities: fields.capabilities,
    skills: fields.skills,
    handoffs: fields.handoffs,
    can: fields.can,
    summary: firstParagraph(body),
  }
}
