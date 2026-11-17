/**
 * Role card CRUD on disk, including the archive that keeps removed cards
 * reviewable rather than destroyed.
 *
 * @module @chrock-studio/dsh-hyper-roles/store/cards
 */
import { existsSync, mkdirSync, readFileSync, renameSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { normalizeFields, parseRoleDoc, serializeRoleDoc } from '../role-doc.js'
import {
  ARCHIVE_DIR,
  appendChange,
  dirFor,
  GUIDE_SUFFIX,
  NOTES_SUFFIX,
  requireDir,
  roleFile,
  writeText,
} from './paths.js'

/**
 * Resolve one role, project scope first.
 * @param dirs - resolved scope directories.
 * @param id - role id.
 * @returns the card with its scope and companion paths, or undefined.
 */
export function readRole(dirs, id) {
  if (dirs.projectDir !== undefined) {
    const project = readRoleIn(dirs, 'project', id)
    if (project !== undefined) {
      const globalCard = readRoleIn(dirs, 'global', id)
      return { ...project, shadowed: globalCard !== undefined }
    }
  }
  return readRoleIn(dirs, 'global', id)
}

/**
 * Read one role from one exact scope.
 * @param dirs - resolved scope directories.
 * @param scope - `global` or `project`.
 * @param id - role id.
 * @returns the card, or undefined when the file is absent.
 */
export function readRoleIn(dirs, scope, id) {
  const dir = dirFor(dirs, scope)
  if (dir === undefined) return undefined
  const path = roleFile(dir, id)
  if (!existsSync(path)) return undefined
  const { fields, body } = parseRoleDoc(readFileSync(path, 'utf8'))
  return {
    fields,
    body,
    scope,
    path,
    notesPath: roleFile(dir, id, NOTES_SUFFIX),
    guidePath: roleFile(dir, id, GUIDE_SUFFIX),
    shadowed: false,
  }
}

/**
 * Create a role in one scope.
 * @param dirs - resolved scope directories.
 * @param request - scope, identity and content.
 * @returns the created card.
 * @throws Error when the id already exists in that scope.
 */
export function createRole(dirs, request) {
  const dir = requireDir(dirs, request.scope)
  const fields = normalizeFields({ ...request.fields, id: request.id, title: request.title, version: 1 })
  const path = roleFile(dir, fields.id)
  if (existsSync(path)) throw new Error(`role "${fields.id}" already exists in ${request.scope} scope`)
  writeText(path, serializeRoleDoc({ fields, body: request.body ?? '' }))
  appendChange(dir, `${fields.id} v1 created`)
  return readRoleIn(dirs, request.scope, fields.id)
}

/**
 * Save a role card, merging given fields over the current ones.
 * @param dirs - resolved scope directories.
 * @param request - scope (defaults to the resolving scope), id, patch, expected version.
 * @returns the saved card.
 * @throws Error with `code: 'stale'` when the version no longer matches.
 */
export function saveRole(dirs, request) {
  const resolved = request.scope === undefined ? readRole(dirs, request.id) : readRoleIn(dirs, request.scope, request.id)
  if (resolved === undefined) throw new Error(`role "${request.id}" does not exist`)
  const dir = requireDir(dirs, resolved.scope)
  if (request.expectedVersion !== undefined && request.expectedVersion !== resolved.fields.version) {
    const error = new Error(`role "${request.id}" changed since it was read (now v${resolved.fields.version})`)
    error.code = 'stale'
    error.currentVersion = resolved.fields.version
    throw error
  }
  const fields = normalizeFields({
    ...resolved.fields,
    ...request.fields,
    id: resolved.fields.id,
    version: resolved.fields.version + 1,
  })
  const body = request.body === undefined ? resolved.body : request.body
  writeText(roleFile(dir, fields.id), serializeRoleDoc({ fields, body }))
  const actor = request.actor === undefined ? '' : ` by ${request.actor}`
  appendChange(dir, `${fields.id} v${fields.version} updated${actor}`)
  return readRoleIn(dirs, resolved.scope, fields.id)
}

/**
 * Archive a role: its card, notes and guide move into `.archive/<id>.<stamp>/`.
 * @param dirs - resolved scope directories.
 * @param request - id plus optional scope.
 * @returns the archive directory.
 */
export function archiveRole(dirs, request) {
  const resolved = request.scope === undefined ? readRole(dirs, request.id) : readRoleIn(dirs, request.scope, request.id)
  if (resolved === undefined) throw new Error(`role "${request.id}" does not exist`)
  const dir = requireDir(dirs, resolved.scope)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const target = join(dir, ARCHIVE_DIR, `${resolved.fields.id}.${stamp}`)
  mkdirSync(target, { recursive: true })
  for (const path of [resolved.path, resolved.notesPath, resolved.guidePath]) {
    if (existsSync(path)) renameSync(path, join(target, path.slice(dir.length + 1)))
  }
  appendChange(dir, `${resolved.fields.id} v${resolved.fields.version} archived → ${ARCHIVE_DIR}/${resolved.fields.id}.${stamp}`)
  return target
}

/**
 * Report whether a role exists in a scope.
 * @param dirs - resolved scope directories.
 * @param scope - `global` or `project`.
 * @param id - role id.
 * @returns whether the card file exists.
 */
export function roleExists(dirs, scope, id) {
  const dir = dirFor(dirs, scope)
  if (dir === undefined) return false
  try {
    return existsSync(roleFile(dir, id)) && statSync(roleFile(dir, id)).isFile()
  } catch {
    return false
  }
}
