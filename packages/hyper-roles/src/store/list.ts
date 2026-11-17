/**
 * Listing roles across both scopes: the read projection the catalog, roster
 * and panel all share.
 *
 * @module @chrock-hyper/dsh-hyper-roles/store/list
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import type { RoleFields } from '../role-doc.ts'
import { parseRoleDoc, ROLE_ID } from '../role-doc.ts'
import type { ResolvedDirs, RoleScope } from '../scopes.ts'
import { GUIDE_SUFFIX, NOTES_SUFFIX } from './paths.ts'
import { firstParagraph } from './text.ts'

/** The summary of one card, without saying where it lives. */
export interface RoleRow {
  id: string
  title: string
  version: number
  capabilities: string[]
  skills: string[]
  handoffs: string[]
  can: string[]
  summary: string
}

/** One row as a scope reports it; `shadowed` only appears on global rows. */
export interface RoleListRow extends RoleRow {
  scope: RoleScope
  path: string
  shadowed?: boolean
}

/** A card file that failed to parse, reported instead of thrown. */
export interface RoleProblem {
  scope: RoleScope
  path: string
  message: string
}

/** One scope directory's read result. */
export interface ScopeScan {
  rows: RoleListRow[]
  problems: RoleProblem[]
}

/** Both scopes, with the shadowing already applied. */
export interface RoleListing {
  global: Array<RoleListRow & { shadowed: boolean }>
  project: RoleListRow[]
  problems: RoleProblem[]
}

/**
 * List the roles of both scopes.
 * @param dirs - resolved scope directories.
 * @returns parsed rows per scope, plus unreadable files as problems.
 */
export function listRoles(dirs: ResolvedDirs): RoleListing {
  const global = readDir(dirs.globalDir, 'global')
  const project: ScopeScan = dirs.projectDir === undefined
    ? { rows: [], problems: [] }
    : readDir(dirs.projectDir, 'project')
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
function readDir(dir: string, scope: RoleScope): ScopeScan {
  const rows: RoleListRow[] = []
  const problems: RoleProblem[] = []
  let names: string[]
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
export function summarize(fields: RoleFields, body: string): RoleRow {
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
