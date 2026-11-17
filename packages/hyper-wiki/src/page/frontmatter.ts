/**
 * Page frontmatter: parsing, field normalization, and serialization.
 *
 * A page is one Markdown file whose optional YAML frontmatter carries the four
 * fields this plugin owns (`title`, `tags`, `status`, `updated`). The rest of
 * the file is the body. Parsing is deliberately tolerant: a bad status or
 * date becomes a recoverable complaint instead of a throw.
 *
 * @module @chrock-studio/dsh-hyper-wiki/page/frontmatter
 */

/** Page lifecycle values the plugin recognizes. */
export type PageStatus = 'stable' | 'wip' | 'deprecated'

/** Page lifecycle values a frontmatter `status` may take. */
export const PAGE_STATUSES = ['stable', 'wip', 'deprecated'] as const

/** Field order used when a page is serialized. */
const FIELD_ORDER = ['title', 'tags', 'status', 'updated'] as const

/** One frontmatter value: a scalar, or a nested one-level map. */
export type FrontmatterValue = string | Record<string, string>

/** Parsed frontmatter: key to scalar or nested map. */
export type FrontmatterFields = Record<string, FrontmatterValue>

/** Result of splitting one document into frontmatter and body. */
export interface SplitFrontmatter {
  fields: FrontmatterFields
  body: string
  hasFrontmatter: boolean
  errors: string[]
}

/** A page document as `parsePage` reports it. */
export interface ParsedPage {
  title: string
  tags: string[]
  status: string | undefined
  updated: string | undefined
  body: string
  hasFrontmatter: boolean
  fields: FrontmatterFields
  errors: string[]
}

/** Fields `serializePage` accepts; anything unusable falls back. */
export interface PageInput {
  title?: unknown
  tags?: unknown
  status?: unknown
  updated?: unknown
  body?: unknown
}

/**
 * True when a value is one of the page statuses.
 * @param value - candidate status.
 * @returns whether it is `stable`, `wip`, or `deprecated`.
 */
export function isPageStatus(value: unknown): value is PageStatus {
  return (PAGE_STATUSES as readonly unknown[]).includes(value)
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
export function splitFrontmatter(text: unknown): SplitFrontmatter {
  const source = typeof text === 'string' ? text : ''
  const clipped = source.startsWith('\uFEFF') ? source.slice(1) : source
  const lines = clipped.split(/\r?\n/)
  const errors: string[] = []
  const first = lines[0]
  if (first === undefined || first.trim() !== '---') {
    return { fields: {}, body: lines.join('\n'), hasFrontmatter: false, errors }
  }
  let close = -1
  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (line !== undefined && line.trim() === '---') {
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
function parseFieldLines(lines: string[], errors: string[]): FrontmatterFields {
  const fields: FrontmatterFields = {}
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    if (line === undefined) break
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
    // A match with two groups always fills both; `?? ''` keeps the indexing
    // check honest without changing any accepted input.
    const key = match[1] ?? ''
    const rawValue = match[2] ?? ''
    if (rawValue.trim() === '') {
      const nested: Record<string, string> = {}
      let cursor = index + 1
      let found = 0
      while (cursor < lines.length) {
        const next = lines[cursor]
        if (next === undefined) break
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
        nested[nestedMatch[1] ?? ''] = unquote((nestedMatch[2] ?? '').trim())
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
export function unquote(value: string): string
export function unquote(value: unknown): unknown
export function unquote(value: unknown): unknown {
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
export function quote(value: unknown): string {
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
export function normalizeTags(value: unknown): string[] {
  if (value === undefined || value === null) return []
  const source = Array.isArray(value) ? value.join(',') : String(value)
  const bare = source.trim().replace(/^\[/, '').replace(/\]$/, '')
  const tags: string[] = []
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
export function parsePage(text: unknown): ParsedPage {
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
export function serializePage(page: PageInput): string {
  const values: Record<string, unknown> = {
    title: page.title ?? '',
    tags: normalizeTags(page.tags),
    status: page.status ?? 'wip',
    updated: page.updated ?? '',
  }
  const lines = ['---']
  for (const key of FIELD_ORDER) {
    // `tags` is the one entry the table above always fills with an array.
    const value = values[key]
    if (key === 'tags') {
      const tags = Array.isArray(value) ? value.map(quote) : []
      lines.push(`tags: ${tags.join(', ')}`.trimEnd())
      continue
    }
    lines.push(`${key}: ${quote(value)}`.trimEnd())
  }
  lines.push('---', '')
  return `${lines.join('\n')}\n${page.body ?? ''}`
}
