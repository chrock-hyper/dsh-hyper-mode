/**
 * Role files on disk: cards, experience notes, reading guides and the
 * append-only change log that makes every write reviewable.
 *
 * One rule governs the whole module: a role id is untrusted input (it arrives
 * from model tool arguments and from the panel's URL), so every path goes
 * through {@link roleFile}, which validates the id and proves the result stays
 * inside its scope directory.
 *
 * @module @chrock-studio/dsh-hyper-mode/hyper-roles/store
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

import { isInside } from '../../shared/paths.js'
import { normalizeFields, parseRoleDoc, ROLE_ID, serializeRoleDoc } from './role-doc.js'

/** Directory that keeps archived roles, relative to a scope directory. */
const ARCHIVE_DIR = '.archive'
/** Suffix that marks a notes file rather than a role card. */
const NOTES_SUFFIX = '.notes.md'
/** Suffix that marks a reading guide rather than a role card. */
const GUIDE_SUFFIX = '.guide.md'

/**
 * Resolve one role's card path, refusing ids that could escape the scope.
 * @param dir - scope directory.
 * @param id - role id.
 * @param suffix - file suffix, defaulting to the card's `.md`.
 * @returns the absolute path.
 */
export function roleFile(dir, id, suffix = '.md') {
  if (typeof id !== 'string' || !ROLE_ID.test(id)) throw new Error(`invalid role id "${String(id)}"`)
  const path = join(dir, `${id}${suffix}`)
  if (!isInside(dir, path)) throw new Error(`role path escapes its scope: ${path}`)
  return path
}

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
function summarize(fields, body) {
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

/**
 * List the roles shipped inside this bundle.
 * @param bundleRoot - absolute bundle package root.
 * @returns parsed shipped cards with their source path.
 */
export function listBuiltins(bundleRoot) {
  const dir = join(bundleRoot, 'plugins', 'hyper-roles', 'roles')
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
 * @param bundleRoot - absolute bundle package root.
 * @param dirs - resolved scope directories.
 * @param request - shipped id and target scope.
 * @returns the created card.
 * @throws Error when the shipped role is unknown or the target already exists.
 */
export function copyBuiltin(bundleRoot, dirs, request) {
  const builtin = listBuiltins(bundleRoot).find((row) => row.id === request.id)
  if (builtin === undefined) throw new Error(`shipped role "${request.id}" is unknown`)
  const dir = requireDir(dirs, request.scope)
  const path = roleFile(dir, builtin.id)
  if (existsSync(path)) throw new Error(`role "${builtin.id}" already exists in ${request.scope} scope`)
  const { fields, body } = parseRoleDoc(readFileSync(builtin.path, 'utf8'))
  writeText(path, serializeRoleDoc({ fields: { ...fields, version: 1 }, body }))
  appendChange(dir, `${fields.id} v1 copied from shipped role`)
  return readRoleIn(dirs, request.scope, fields.id)
}

/**
 * Append one line to a scope's change log.
 * @param dir - scope directory.
 * @param line - what happened, without the timestamp.
 */
function appendChange(dir, line) {
  const path = join(dir, 'CHANGELOG.md')
  const previous = readText(path)
  const entry = `- ${new Date().toISOString()} · ${line}\n`
  writeText(path, previous === '' ? `# 岗位变更记录\n\n${entry}` : `${previous.trimEnd()}\n${entry}`)
}

/**
 * Parse a notes file into entries.
 * @param text - file contents.
 * @returns entries in file order.
 */
export function parseNotes(text) {
  const entries = []
  for (const chunk of String(text ?? '').split(/^## /m).slice(1)) {
    const [heading, ...rest] = chunk.split('\n')
    const match = /^(\S+)\s*·\s*(.*)$/.exec(heading.trim())
    entries.push({
      at: match === null ? '' : match[1],
      source: match === null ? heading.trim() : match[2].trim(),
      text: rest.join('\n').trim(),
    })
  }
  return entries
}

/**
 * First prose paragraph of a card body, used for compact summaries.
 * @param body - card body.
 * @returns one paragraph, without headings.
 */
export function firstParagraph(body) {
  const lines = String(body ?? '').split('\n')
  const collected = []
  for (const line of lines) {
    if (line.startsWith('#')) {
      if (collected.length > 0) break
      continue
    }
    if (line.trim() === '') {
      if (collected.length > 0) break
      continue
    }
    collected.push(line.trim())
  }
  return collected.join(' ')
}

/**
 * Resolve a scope name to its directory.
 * @param dirs - resolved scope directories.
 * @param scope - `global` or `project`.
 * @returns the directory, or undefined when a project scope has no root.
 */
function dirFor(dirs, scope) {
  if (scope === 'global') return dirs.globalDir
  if (scope === 'project') return dirs.projectDir
  throw new Error(`unknown role scope "${String(scope)}"`)
}

/**
 * Resolve a writable scope directory, creating it when necessary.
 * @param dirs - resolved scope directories.
 * @param scope - `global` or `project`.
 * @returns the directory.
 * @throws Error when the caller asked for a project scope without a project.
 */
function requireDir(dirs, scope) {
  const dir = dirFor(dirs, scope)
  if (dir === undefined) {
    throw new Error('no project root is known for this caller, so project-scoped roles are unavailable; use scope "global" or run inside a project')
  }
  mkdirSync(dir, { recursive: true })
  return dir
}

/** @param path - file path. @returns its text, or an empty string when absent. */
function readText(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

/**
 * Write text through a temporary sibling so readers never see a torn file.
 * @param path - destination.
 * @param text - content.
 */
function writeText(path, text) {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.tmp-${process.pid}`
  writeFileSync(temporary, text, 'utf8')
  renameSync(temporary, path)
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
