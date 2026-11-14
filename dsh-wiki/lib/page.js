/**
 * Page text: frontmatter parsing, serialization, page identity and hashing.
 *
 * A page is one Markdown file whose optional YAML frontmatter carries the four
 * fields this plugin owns (`title`, `tags`, `status`, `updated`). The rest of
 * the file is the body, and the body's sha1 is the identity a draft's `base`
 * records.
 *
 * Everything here is pure: no filesystem access, no clock. Callers pass the
 * text and, where a date is written, the date to write.
 *
 * @module dsh-wiki/lib/page
 */
import { createHash } from 'node:crypto'

/** Page lifecycle values a frontmatter `status` may take. */
export const PAGE_STATUSES = ['stable', 'wip', 'deprecated']

/** First path segments reserved for the plugin's own bookkeeping. */
export const RESERVED_SEGMENTS = ['drafts', '.trash']

/** Longest page id accepted, in characters. */
const MAX_PATH_LENGTH = 300

/** Longest single path segment accepted, in characters. */
const MAX_SEGMENT_LENGTH = 100

/** Field order used when a page is serialized. */
const FIELD_ORDER = ['title', 'tags', 'status', 'updated']

/**
 * sha1 of a string, hex encoded.
 * @param text - bytes to hash, treated as UTF-8.
 * @returns the 40-character lowercase hex digest.
 */
export function sha1Hex(text) {
  return createHash('sha1').update(text, 'utf8').digest('hex')
}

/**
 * True when a value is one of the page statuses.
 * @param value - candidate status.
 * @returns whether it is `stable`, `wip`, or `deprecated`.
 */
export function isPageStatus(value) {
  return PAGE_STATUSES.includes(value)
}

/**
 * Split a document into its frontmatter field map and its body.
 *
 * Tolerates a UTF-8 BOM, CRLF line endings, and a missing block. A field whose
 * value is empty starts a nested one-level map, which is how a draft records
 * its `draft:` block inside the same frontmatter.
 * @param text - raw file contents.
 * @returns the parsed fields (raw strings or nested maps), the body with LF
 *   endings, whether a frontmatter block existed, and any parse complaints.
 */
export function splitFrontmatter(text) {
  const source = typeof text === 'string' ? text : ''
  const clipped = source.startsWith('\uFEFF') ? source.slice(1) : source
  const lines = clipped.split(/\r?\n/)
  const errors = []
  if (lines.length === 0 || lines[0].trim() !== '---') {
    return { fields: {}, body: lines.join('\n'), hasFrontmatter: false, errors }
  }
  let close = -1
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index].trim() === '---') {
      close = index
      break
    }
  }
  if (close < 0) {
    errors.push('frontmatter: missing closing ---')
    return { fields: {}, body: lines.join('\n'), hasFrontmatter: false, errors }
  }
  const fields = parseFieldLines(lines.slice(1, close), errors)
  const rest = lines.slice(close + 1)
  // Serialization always writes one blank line after the fence; drop exactly
  // that line so parse(serialize(page)) returns the same body.
  if (rest.length > 0 && rest[0] === '') rest.shift()
  return { fields, body: rest.join('\n'), hasFrontmatter: true, errors }
}

/**
 * Parse the lines between the frontmatter fences.
 * @param lines - raw field lines.
 * @param errors - collector for recoverable complaints.
 * @returns field map; an empty value opens a nested indented map.
 */
function parseFieldLines(lines, errors) {
  const fields = {}
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    if (line.trim() === '' || line.trimStart().startsWith('#')) {
      index += 1
      continue
    }
    const match = /^([A-Za-z0-9_.-]+)[ \t]*:[ \t]*(.*)$/.exec(line)
    if (!match) {
      errors.push(`frontmatter: unrecognized line: ${line.slice(0, 60)}`)
      index += 1
      continue
    }
    const [, key, rawValue] = match
    if (rawValue.trim() === '') {
      const nested = {}
      let cursor = index + 1
      let found = 0
      while (cursor < lines.length) {
        const next = lines[cursor]
        if (next.trim() === '') {
          cursor += 1
          continue
        }
        if (!/^[ \t]+\S/.test(next)) break
        const nestedMatch = /^[ \t]+([A-Za-z0-9_.-]+)[ \t]*:[ \t]*(.*)$/.exec(next)
        if (!nestedMatch) {
          errors.push(`frontmatter: unrecognized nested line under ${key}: ${next.trim().slice(0, 60)}`)
          cursor += 1
          continue
        }
        nested[nestedMatch[1]] = unquote(nestedMatch[2].trim())
        found += 1
        cursor += 1
      }
      if (found > 0) {
        fields[key] = nested
        index = cursor
        continue
      }
      fields[key] = ''
      index += 1
      continue
    }
    fields[key] = unquote(rawValue.trim())
    index += 1
  }
  return fields
}

/**
 * Remove one pair of matching YAML quotes.
 * @param value - trimmed raw scalar.
 * @returns the unquoted scalar.
 */
export function unquote(value) {
  if (typeof value !== 'string' || value.length < 2) return value
  const first = value[0]
  const last = value[value.length - 1]
  if (first === '"' && last === '"') {
    return value.slice(1, -1).replace(/\\(["\\])/g, '$1')
  }
  if (first === "'" && last === "'") return value.slice(1, -1).replace(/''/g, "'")
  return value
}

/**
 * Quote a scalar for serialization when leaving it bare would change its
 * meaning on the way back.
 * @param value - scalar text.
 * @returns the serialized scalar.
 */
export function quote(value) {
  const text = String(value ?? '')
  const needsQuotes = text === ''
    || text !== text.trim()
    || /^["'[\]{}>|*&!%@`#-]/.test(text)
    || text.includes(': ')
    || text.includes(' #')
  if (!needsQuotes) return text
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/**
 * Normalize a `tags` field into a list of non-empty tags.
 * @param value - raw field value: comma-separated text or a bracketed list.
 * @returns tag names, trimmed and deduplicated, in source order.
 */
export function normalizeTags(value) {
  if (value === undefined || value === null) return []
  const source = Array.isArray(value) ? value.join(',') : String(value)
  const bare = source.trim().replace(/^\[/, '').replace(/\]$/, '')
  const tags = []
  for (const part of bare.split(',')) {
    const tag = part.trim().replace(/^["']/, '').replace(/["']$/, '').trim()
    if (tag !== '' && !tags.includes(tag)) tags.push(tag)
  }
  return tags
}

/**
 * Parse a page document.
 * @param text - raw file contents.
 * @returns the four fields (`status` keeps its raw value so callers can see a
 *   bad one), the body, and recoverable complaints.
 */
export function parsePage(text) {
  const { fields, body, hasFrontmatter, errors } = splitFrontmatter(text)
  const status = typeof fields.status === 'string' ? fields.status : undefined
  if (status !== undefined && status !== '' && !isPageStatus(status)) {
    errors.push(`page: invalid status: ${status}`)
  }
  const updated = typeof fields.updated === 'string' ? fields.updated : undefined
  if (updated !== undefined && updated !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(updated)) {
    errors.push(`page: invalid updated: ${updated}`)
  }
  return {
    title: typeof fields.title === 'string' ? fields.title : '',
    tags: normalizeTags(fields.tags),
    status,
    updated,
    body,
    hasFrontmatter,
    fields,
    errors,
  }
}

/**
 * Serialize page fields and a body into one page document.
 * @param page - `title`, `tags`, `status`, `updated`, and the body text.
 * @returns the document, with a blank line between the fence and the body.
 */
export function serializePage(page) {
  const values = {
    title: page.title ?? '',
    tags: normalizeTags(page.tags),
    status: page.status ?? 'wip',
    updated: page.updated ?? '',
  }
  const lines = ['---']
  for (const key of FIELD_ORDER) {
    const value = values[key]
    if (key === 'tags') {
      lines.push(`tags: ${value.map(quote).join(', ')}`.trimEnd())
      continue
    }
    lines.push(`${key}: ${quote(value)}`.trimEnd())
  }
  lines.push('---', '')
  return `${lines.join('\n')}\n${page.body ?? ''}`
}

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

/**
 * The local calendar date in ISO form.
 *
 * `updated` is a human-facing field, so it follows the author's calendar
 * rather than UTC: approving at 03:00 local time should not stamp yesterday.
 * Draft timestamps keep the precise UTC instant (`isoInstant`).
 * @param now - clock injection for tests.
 * @returns `YYYY-MM-DD`.
 */
export function isoTimestamp(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * A precise ISO instant for draft bookkeeping.
 * @param now - clock injection for tests.
 * @returns `YYYY-MM-DDTHH:MM:SS.sssZ`.
 */
export function isoInstant(now = new Date()) {
  const date = now instanceof Date ? now : new Date(now)
  return date.toISOString()
}
