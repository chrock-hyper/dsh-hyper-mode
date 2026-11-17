/**
 * Role experience notes: the append-only entries a role accumulates and later
 * reads back as its own memory.
 *
 * @module @chrock-studio/dsh-hyper-roles/store/notes
 */
import type { ResolvedDirs, RoleScope } from '../scopes.ts'
import { readRole, readRoleIn } from './cards.ts'
import { readText, writeText } from './paths.ts'
import type { NoteEntry } from './text.ts'
import { parseNotes } from './text.ts'

/** A role's notes plus the scope and file they came from. */
export interface RoleNotes {
  entries: NoteEntry[]
  scope: RoleScope | undefined
  path: string | undefined
}

/** What to append: the role, its optional scope, the text and who wrote it. */
export interface NoteRequest {
  id: string
  scope?: RoleScope
  text?: unknown
  source?: unknown
}

/**
 * Read a role's experience entries.
 * @param dirs - resolved scope directories.
 * @param id - role id.
 * @returns entries newest last, the scope resolved, and the file path.
 */
export function readNotes(dirs: ResolvedDirs, id: string): RoleNotes {
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
export function appendNote(dirs: ResolvedDirs, request: NoteRequest): NoteEntry {
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
