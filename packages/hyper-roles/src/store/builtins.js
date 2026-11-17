/**
 * The role cards shipped inside the bundle (`<packageRoot>/roles`) and the
 * copy operation that turns one into an editable card.
 *
 * Shipped cards are read-only templates: a broken one is skipped rather than
 * failing the whole catalog, because it is a packaging mistake, not user data.
 *
 * @module @chrock-studio/dsh-hyper-roles/store/builtins
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parseRoleDoc, serializeRoleDoc } from '../role-doc.js'
import { readRoleIn } from './cards.js'
import { summarize } from './list.js'
import { appendChange, requireDir, roleFile, writeText } from './paths.js'

/**
 * List the roles shipped inside this bundle.
 * @param packageRoot - absolute bundle package root.
 * @returns parsed shipped cards with their source path.
 */
export function listBuiltins(packageRoot) {
  const dir = join(packageRoot, 'roles')
  let names
  try {
    names = readdirSync(dir)
  } catch {
    return []
  }
  const rows = []
  for (const name of names.sort()) {
    if (!name.endsWith('.md')) continue
    const path = join(dir, name)
    try {
      const { fields, body } = parseRoleDoc(readFileSync(path, 'utf8'))
      rows.push({ ...summarize(fields, body), path, source: 'builtin' })
    } catch {
      // A broken shipped card is a packaging mistake; the rest stay usable.
    }
  }
  return rows
}

/**
 * Copy a shipped role into a writable scope.
 * @param packageRoot - absolute bundle package root.
 * @param dirs - resolved scope directories.
 * @param request - shipped id and target scope.
 * @returns the created card.
 * @throws Error when the shipped role is unknown or the target already exists.
 */
export function copyBuiltin(packageRoot, dirs, request) {
  const builtin = listBuiltins(packageRoot).find((row) => row.id === request.id)
  if (builtin === undefined) throw new Error(`shipped role "${request.id}" is unknown`)
  const dir = requireDir(dirs, request.scope)
  const path = roleFile(dir, builtin.id)
  if (existsSync(path)) throw new Error(`role "${builtin.id}" already exists in ${request.scope} scope`)
  const { fields, body } = parseRoleDoc(readFileSync(builtin.path, 'utf8'))
  writeText(path, serializeRoleDoc({ fields: { ...fields, version: 1 }, body }))
  appendChange(dir, `${fields.id} v1 copied from shipped role`)
  return readRoleIn(dirs, request.scope, fields.id)
}
