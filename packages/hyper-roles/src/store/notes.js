/**
 * Role experience notes: the append-only entries a role accumulates and later
 * reads back as its own memory.
 *
 * @module @chrock-studio/dsh-hyper-roles/store/notes
 */
import { readRole, readRoleIn } from './cards.js'
import { readText, writeText } from './paths.js'
import { parseNotes } from './text.js'

/**
 * Read a role's experience entries.
 * @param dirs - resolved scope directories.
 * @param id - role id.
 * @returns entries newest last, the scope resolved, and the file path.
 */
export function readNotes(dirs, id) {
  const card = readRole(dirs, id)
  if (card === undefined) return { entries: [], scope: undefined, path: undefined }
  const entries = parseNotes(readText(card.notesPath))
  return { entries, scope: card.scope, path: card.notesPath }
}

/**
 * Append one experience entry to a role.
 * @param dirs - resolved scope directories.
 * @param request - id, optional scope, text and its source label.
 * @returns the appended entry.
 */
export function appendNote(dirs, request) {
  const card = request.scope === undefined ? readRole(dirs, request.id) : readRoleIn(dirs, request.scope, request.id)
  if (card === undefined) throw new Error(`role "${request.id}" does not exist`)
  const text = String(request.text ?? '').trim()
  if (text === '') throw new Error('note text must not be empty')
  const at = new Date().toISOString()
  const source = String(request.source ?? 'agent').trim() || 'agent'
  const block = `## ${at} · ${source}\n${text}\n`
  const existing = readText(card.notesPath)
  writeText(card.notesPath, existing === '' ? `${block}` : `${existing.trimEnd()}\n\n${block}`)
  return { at, source, text }
}
