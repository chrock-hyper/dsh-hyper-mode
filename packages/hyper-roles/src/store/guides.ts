/**
 * Role reading guides: one prose file per role that the tool can read and
 * replace, separate from the card itself.
 *
 * @module @chrock-studio/dsh-hyper-roles/store/guides
 */
import type { ResolvedDirs, RoleScope } from '../scopes.ts'
import { readRole, readRoleIn } from './cards.ts'
import { readText, writeText } from './paths.ts'

/** A role's guide plus the scope and file it came from. */
export interface RoleGuide {
  text: string
  path: string | undefined
  scope: RoleScope | undefined
}

/** What to write: the role, its optional scope, and the new text. */
export interface GuideRequest {
  id: string
  scope?: RoleScope
  text?: unknown
}

/**
 * Read one role's reading guide.
 * @param dirs - resolved scope directories.
 * @param id - role id.
 * @returns the guide text and path, when a role and guide exist.
 */
export function readGuide(dirs: ResolvedDirs, id: string): RoleGuide {
  const card = readRole(dirs, id)
  if (card === undefined) return { text: '', path: undefined, scope: undefined }
  return { text: readText(card.guidePath), path: card.guidePath, scope: card.scope }
}

/**
 * Replace a role's reading guide.
 * @param dirs - resolved scope directories.
 * @param request - id, optional scope, and the new text.
 * @returns the written path.
 */
export function writeGuide(dirs: ResolvedDirs, request: GuideRequest): string {
  const card = request.scope === undefined ? readRole(dirs, request.id) : readRoleIn(dirs, request.scope, request.id)
  if (card === undefined) throw new Error(`role "${request.id}" does not exist`)
  writeText(card.guidePath, String(request.text ?? ''))
  return card.guidePath
}
