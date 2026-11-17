/**
 * Role files on disk: cards, experience notes, reading guides and the
 * append-only change log that makes every write reviewable.
 *
 * One rule governs the whole module: a role id is untrusted input (it arrives
 * from model tool arguments and from the panel's URL), so every path goes
 * through {@link roleFile}, which validates the id and proves the result stays
 * inside its scope directory.
 *
 * This module is the entry point: every implementation lives under `store/`,
 * and the export names here are the stable surface other modules import.
 *
 * @module @chrock-studio/dsh-hyper-roles/store
 */
export { copyBuiltin, listBuiltins } from './store/builtins.js'
export { archiveRole, createRole, readRole, readRoleIn, roleExists, saveRole } from './store/cards.js'
export { readGuide, writeGuide } from './store/guides.js'
export { listRoles } from './store/list.js'
export { appendNote, readNotes } from './store/notes.js'
export { roleFile } from './store/paths.js'
export { firstParagraph, parseNotes } from './store/text.js'
