/**
 * Role reading guides: one prose file per role that the tool can read and
 * replace, separate from the card itself.
 *
 * @module @chrock-studio/dsh-hyper-roles/store/guides
 */
import { readRole, readRoleIn } from './cards.js'
import { readText, writeText } from './paths.js'

/**
 * Read one role's reading guide.
 * @param dirs - resolved scope directories.
 * @param id - role id.
 * @returns the guide text and path, when a role and guide exist.
 */
export function readGuide(dirs, id) {
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
export function writeGuide(dirs, request) {
  const card = request.scope === undefined ? readRole(dirs, request.id) : readRoleIn(dirs, request.scope, request.id)
  if (card === undefined) throw new Error(`role "${request.id}" does not exist`)
  writeText(card.guidePath, String(request.text ?? ''))
  return card.guidePath
}
