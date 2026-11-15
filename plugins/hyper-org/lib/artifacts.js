/**
 * Artifact previews for the order board.
 *
 * The browser half cannot open a file: it has no shell, no file manager, and a
 * `file://` URL is blocked from an http page. So "open the deliverable" means
 * "read its text through the Host and copy the path for the human".
 *
 * That makes this module a read surface over the project tree, and a read
 * surface needs guards. A path arrives from a URL and the declared list comes
 * from a field a model can write, so every request walks the same five checks
 * in order: shape, declaration, lexical containment, symlink containment, type
 * and size — then a binary sniff.
 *
 * @module @chrock-studio/dsh-hyper-mode/hyper-org/artifacts
 */
import { closeSync, openSync, readSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, normalize, resolve } from 'node:path'

import { isInside } from '../../shared/paths.js'

/** Soft preview ceiling: a longer file is truncated, not refused. */
export const MAX_BYTES = 256 * 1024
/** Hard ceiling: a larger file is refused outright. */
export const HARD_MAX_BYTES = 2 * 1024 * 1024
/** Bytes sniffed for NUL when deciding "this is not a text file". */
const BINARY_PROBE = 8 * 1024

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
 * One artifact's status, for the detail column.
 *
 * Never throws: a broken declaration renders as a status instead of failing the
 * whole order, because the rest of the card is still worth reading.
 * @param base - project root, when known.
 * @param path - the declared path.
 * @returns `{ path, kind, bytes? }` with kind `file`, `dir`, `missing` or `escape`.
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
    if (info.isDirectory()) return { ...shown, kind: 'dir' }
    if (!info.isFile()) return { ...shown, kind: 'missing' }
    return { ...shown, kind: 'file', bytes: info.size }
  } catch {
    return { ...shown, kind: 'missing' }
  }
}

/**
 * Read one declared artifact as text.
 *
 * Guards run in order and the first refusal wins; each refusal carries the HTTP
 * `status` and a stable `code`, so the panel shows the Host's sentence instead
 * of inventing one.
 * @param options - base directory, declared paths, requested path and soft limit.
 * @returns `{ ok: true, path, bytes, truncated, text }`.
 * @throws Error with `status` and `code` when a guard refuses the request.
 */
export function readArtifactText(options) {
  const { base, declaredPaths } = options
  const requested = declaredPath(options.path)
  const declared = (Array.isArray(declaredPaths) ? declaredPaths : [])
    .map((entry) => candidatePath(entry))
    .filter((entry) => entry !== undefined)
  if (!declared.includes(requested)) {
    throw failure(400, 'not_declared', `交付物没有在工单里声明：${requested}；先 update 挂上它`)
  }
  if (base === undefined) {
    throw failure(400, 'no_project', '这个会话没有项目根，交付物只能在项目里预览；复制路径后手动打开')
  }
  const candidate = resolve(base, requested)
  if (!isInside(base, candidate)) {
    throw failure(400, 'path_escape', `交付物路径越出了项目：${requested}`)
  }
  let root
  let target
  try {
    root = realpathSync(base)
    target = realpathSync(candidate)
  } catch {
    throw failure(404, 'missing', `交付物不存在：${requested}`)
  }
  if (!isInside(root, target)) {
    throw failure(400, 'path_escape', `交付物经符号链接指向了项目之外：${requested}`)
  }
  const info = statSync(target)
  if (info.isDirectory()) {
    throw failure(409, 'is_directory', `交付物是目录，不能预览：${requested}`)
  }
  if (!info.isFile()) {
    throw failure(409, 'is_directory', `交付物不是常规文件，不能预览：${requested}`)
  }
  if (info.size > HARD_MAX_BYTES) {
    throw failure(413, 'too_large', `交付物超过 ${HARD_MAX_BYTES / 1024 / 1024} MiB，不预览：${requested}`)
  }
  const limit = Math.min(options.maxBytes ?? MAX_BYTES, HARD_MAX_BYTES, info.size)
  const buffer = Buffer.alloc(limit)
  const fd = openSync(target, 'r')
  try {
    readSync(fd, buffer, 0, limit, 0)
  } finally {
    closeSync(fd)
  }
  if (buffer.subarray(0, BINARY_PROBE).includes(0)) {
    throw failure(415, 'binary', `交付物看起来是二进制文件，不能预览：${requested}；用编辑器打开，或复制路径`)
  }
  return {
    ok: true,
    path: requested,
    bytes: info.size,
    truncated: info.size > limit,
    text: buffer.toString('utf8'),
  }
}

/**
 * Validate and normalize a requested path (guard 1).
 *
 * The URL layer already percent-decodes once, but a declared path may also
 * arrive encoded from a fixture or a script, so decode again before judging —
 * `..%2F..` must not slip past the absolute-path and containment checks.
 * @param raw - raw path.
 * @returns the normalized relative path.
 * @throws Error with code `path_escape` for anything unusable.
 */
function declaredPath(raw) {
  if (typeof raw !== 'string') throw failure(400, 'path_escape', '交付物路径不合法：需要相对路径')
  let decoded
  try {
    decoded = decodeURIComponent(raw)
  } catch {
    throw failure(400, 'path_escape', `交付物路径不是合法的 URL 编码：${raw}`)
  }
  const value = decoded.trim()
  if (value === '') throw failure(400, 'path_escape', '交付物路径不合法：需要相对路径')
  if (value.includes('\0')) throw failure(400, 'path_escape', '交付物路径含 NUL 字节')
  if (isAbsolute(value)) throw failure(400, 'path_escape', `交付物路径必须是相对路径：${value}`)
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
 * @param status - HTTP status.
 * @param code - stable error code.
 * @param message - sentence shown to the human.
 * @returns the error.
 */
function failure(status, code, message) {
  const error = new Error(message)
  error.status = status
  error.code = code
  return error
}
