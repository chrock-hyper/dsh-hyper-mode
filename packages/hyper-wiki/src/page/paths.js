/**
 * Page identity: ids, titles, and the path guard.
 *
 * A page id is a relative POSIX path ending in `.md`, and this module is the
 * only place that decides which ids are acceptable. Nothing here touches the
 * filesystem; callers hand the id over and join it themselves.
 *
 * @module @chrock-studio/dsh-hyper-wiki/page/paths
 */

/** First path segments reserved for the plugin's own bookkeeping. */
export const RESERVED_SEGMENTS = ['drafts', '.trash']

/** Longest page id accepted, in characters. */
const MAX_PATH_LENGTH = 300

/** Longest single path segment accepted, in characters. */
const MAX_SEGMENT_LENGTH = 100

/**
 * Split a page id into its extension-less stem.
 * @param path - normalized page id such as `guide/setup.md`.
 * @returns the last segment without `.md`.
 */
export function stemOf(path) {
  const base = String(path ?? '').split('/').pop() ?? ''
  return base.endsWith('.md') ? base.slice(0, -3) : base
}

/**
 * The display title of a parsed page.
 * @param page - parsed page.
 * @param path - page id, used when the frontmatter has no title.
 * @returns the frontmatter title, or the file stem.
 */
export function displayTitle(page, path) {
  const title = typeof page?.title === 'string' ? page.title.trim() : ''
  return title === '' ? stemOf(path) : title
}

/**
 * Validate and normalize a page id.
 *
 * Accepts a path with or without the `.md` suffix, rejects every path that
 * could escape the wiki tree or collide with the plugin's reserved
 * directories, and returns the canonical POSIX id.
 * @param input - model- or user-supplied relative path.
 * @param options - `allowEmpty` keeps the empty string valid (a caller that
 *   treats it as "the whole store").
 * @returns `{ ok: true, path }` or `{ ok: false, code, message }`.
 */
export function normalizePagePath(input, options = {}) {
  if (typeof input !== 'string') {
    return invalid('path must be a string')
  }
  let value = input.trim()
  if (value === '') {
    return options.allowEmpty === true
      ? { ok: true, path: '' }
      : invalid('path is required')
  }
  if (value.includes('\u0000')) return invalid('path must not contain NUL')
  value = value.replace(/\\/g, '/')
  while (value.startsWith('./')) value = value.slice(2)
  if (value.startsWith('/')) return invalid('path must be relative')
  if (!value.endsWith('.md')) value = `${value}.md`
  if (value.length > MAX_PATH_LENGTH) return invalid('path is too long')
  const segments = value.split('/')
  for (const segment of segments) {
    if (segment === '') return invalid('path must not contain an empty segment')
    if (segment === '.' || segment === '..') return invalid('path must not contain . or ..')
    if (segment.length > MAX_SEGMENT_LENGTH) return invalid('path segment is too long')
    if (segment.startsWith('.')) return invalid(`reserved path segment: ${segment}`)
  }
  if (RESERVED_SEGMENTS.includes(segments[0]) && segments.length > 1) {
    return invalid(`reserved page prefix: ${segments[0]}`)
  }
  return { ok: true, path: segments.join('/') }
}

/**
 * Build one invalid-path result.
 * @param message - human-readable reason.
 * @returns the failure shape `normalizePagePath` returns.
 */
function invalid(message) {
  return { ok: false, code: 'invalid_path', message }
}
