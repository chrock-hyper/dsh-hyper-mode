/**
 * Artifact status for the order board.
 *
 * The panel no longer reads files: a deliverable opens in DSH's own right
 * sidebar, which renders Markdown, code, images, PDF, Office and HTML itself.
 * All the browser half needs is *where* the file is, so this module answers one
 * question — "is this declared path a readable file inside the project?" — and
 * hands back the absolute path when the answer is yes.
 *
 * The declared path comes from a field a model can write (`artifacts`), so the
 * two containment checks stay: a lexical check that the resolved path stays
 * inside the project, and a symlink check that its real path still does. A path
 * that escapes is reported as `escape` instead of being opened.
 *
 * @module @chrock-studio/dsh-hyper-mode/hyper-org/artifacts
 */
import { realpathSync, statSync } from 'node:fs'
import { isAbsolute, normalize, resolve } from 'node:path'

import { isInside } from '../../shared/paths.js'

/**
 * The directory artifact paths are resolved against.
 * @param options - the session's project root, when it has one.
 * @returns the absolute project root, or undefined.
 */
export function artifactBase(options = {}) {
  const root = options.projectRoot
  return typeof root === 'string' && root !== '' ? root : undefined
}

/**
 * One artifact's status, for the detail inspector.
 *
 * Never throws: a broken declaration renders as a status instead of failing the
 * whole order, because the rest of the card is still worth reading. A file or a
 * directory also carries `absolutePath`, which is what the browser half turns
 * into a `dsh-resource://file/session/…` address; `missing` and `escape` carry
 * no path on purpose, so a dead row cannot be opened by construction.
 * @param base - project root, when known.
 * @param path - the declared path.
 * @returns `{ path, kind, absolutePath?, bytes? }` with kind `file`, `dir`,
 *   `missing` or `escape`.
 */
export function describeArtifact(base, path) {
  const shown = { path: String(path ?? '') }
  if (base === undefined) return { ...shown, kind: 'missing' }
  const candidate = candidatePath(path)
  if (candidate === undefined) return { ...shown, kind: 'escape' }
  const target = resolve(base, candidate)
  if (!isInside(base, target)) return { ...shown, kind: 'escape' }
  let real
  let root
  try {
    root = realpathSync(base)
    real = realpathSync(target)
  } catch {
    return { ...shown, kind: 'missing' }
  }
  if (!isInside(root, real)) return { ...shown, kind: 'escape' }
  try {
    const info = statSync(real)
    if (info.isDirectory()) return { ...shown, kind: 'dir', absolutePath: target }
    if (!info.isFile()) return { ...shown, kind: 'missing' }
    return { ...shown, kind: 'file', bytes: info.size, absolutePath: target }
  } catch {
    return { ...shown, kind: 'missing' }
  }
}

/**
 * Validate and normalize a declared path.
 *
 * The URL layer already percent-decodes once, but a declared path may also
 * arrive encoded from a fixture or a hand-edited file, so decode again before
 * judging — `..%2F..` must not slip past the absolute-path and containment
 * checks.
 * @param raw - raw path.
 * @returns the normalized relative path.
 * @throws Error with code `path_escape` for anything unusable.
 */
function declaredPath(raw) {
  if (typeof raw !== 'string') throw refusal('交付物路径不合法：需要相对路径')
  let decoded
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    throw refusal(`交付物路径不是合法的 URL 编码：${raw}`)
  }
  const value = decoded.trim()
  if (value === '') throw refusal('交付物路径不合法：需要相对路径')
  if (value.includes('\0')) throw refusal('交付物路径含 NUL 字节')
  if (isAbsolute(value)) throw refusal(`交付物路径必须是相对路径：${value}`)
  return normalize(value)
}

/**
 * Normalize one declared path, tolerating entries no reader could use.
 * @param raw - declared path.
 * @returns the normalized path, or undefined when it is unusable.
 */
function candidatePath(raw) {
  try {
    return declaredPath(raw)
  } catch {
    return undefined
  }
}

/**
 * Build one refusal.
 * @param message - sentence shown to the human.
 * @returns the error.
 */
function refusal(message) {
  const error = new Error(message)
  error.code = 'path_escape'
  return error
}
