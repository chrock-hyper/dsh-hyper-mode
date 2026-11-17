/**
 * The role card format: one Markdown file with a small, strict frontmatter
 * block, and free prose below it.
 *
 * The grammar is deliberately narrower than YAML. Role cards are edited by a
 * panel, by model tools and by hand in an editor, so the parser accepts the
 * shapes people actually type — plain, quoted, folded — and rejects anything
 * ambiguous instead of guessing. Lists are comma-separated because a role's
 * capabilities, skills and handoffs are all short names.
 *
 * Pure functions only: filesystem work lives in `store.js`.
 *
 * @module @chrock-hyper/dsh-hyper-roles/role-doc
 */

/** Kebab-case role id, matching the marker grammar the projection parses. */
export const ROLE_ID = /^[a-z0-9][a-z0-9-]{0,63}$/
/** Capability grants a role may carry in its `can` field. */
export const GRANTS = ['edit-roles', 'train']
/** A routed model reference: `model` or `provider/model`, with the characters real model ids carry. */
export const MODEL_REF = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,119}$/

/** Frontmatter keys in canonical serialization order. */
const LIST_KEYS = ['capabilities', 'skills', 'handoffs', 'can'] as const

/** One role card's frontmatter after validation and defaulting. */
export interface RoleFields {
  id: string
  title: string
  version: number
  model: string
  capabilities: string[]
  skills: string[]
  handoffs: string[]
  can: string[]
}

/**
 * A partially known field set: what a caller (panel body, tool arguments,
 * another card) supplies before {@link normalizeFields} fills in the rest.
 *
 * Every member is `unknown` on purpose — these values arrive as JSON, and
 * `normalizeFields` is the single place that decides what they mean.
 */
export interface RoleFieldInput {
  id?: unknown
  title?: unknown
  version?: unknown
  model?: unknown
  capabilities?: unknown
  skills?: unknown
  handoffs?: unknown
  can?: unknown
}

/** A parsed card: the frontmatter fields and the prose below the fence. */
export interface ParsedRoleDoc {
  fields: RoleFields
  body: string
}

/**
 * Parse one role card.
 * @param text - full file contents.
 * @returns the parsed fields and the body below the frontmatter.
 * @throws Error naming the first problem, so a broken card fails loudly.
 */
export function parseRoleDoc(text: string): ParsedRoleDoc {
  const { raw, body } = splitFrontmatter(text)
  const id = scalar(raw.id)
  const title = scalar(raw.title)
  if (id === undefined) throw new Error('role card frontmatter needs an "id"')
  if (!ROLE_ID.test(id)) throw new Error(`role id "${id}" must be lowercase letters, digits and hyphens`)
  if (title === undefined || title === '') throw new Error(`role "${id}" needs a "title"`)

  const versionText = scalar(raw.version)
  const version = versionText === undefined ? 1 : Number(versionText)
  if (!Number.isSafeInteger(version) || version < 1) {
    throw new Error(`role "${id}" has an invalid version "${versionText}"`)
  }

  const model = (scalar(raw.model) ?? '').trim()
  if (model !== '' && !MODEL_REF.test(model)) {
    throw new Error(`role "${id}" has an invalid model "${model}" (use model or provider/model)`)
  }

  const fields: RoleFields = { id, title, version, model, capabilities: [], skills: [], handoffs: [], can: [] }
  for (const key of LIST_KEYS) fields[key] = parseList(scalar(raw[key]))
  for (const grant of fields.can) {
    if (!GRANTS.includes(grant)) throw new Error(`role "${id}" declares unknown grant "${grant}"`)
  }
  return { fields, body }
}

/**
 * Serialize one role card in canonical order.
 *
 * The writer owns `version` and list order, so repeated saves from the panel
 * and from tools produce byte-identical files and therefore clean diffs.
 * @param card - fields and body to write.
 * @returns the file contents.
 */
export function serializeRoleDoc(card: { fields: RoleFieldInput; body?: unknown }): string {
  const fields = normalizeFields(card.fields)
  const lines = ['---', `id: ${fields.id}`, `title: ${quoteIfNeeded(fields.title)}`, `version: ${fields.version}`]
  if (typeof fields.model === 'string' && fields.model !== '') lines.push(`model: ${quoteIfNeeded(fields.model)}`)
  for (const key of LIST_KEYS) {
    if (fields[key].length > 0) lines.push(`${key}: ${fields[key].join(', ')}`)
  }
  lines.push('---', '')
  const body = typeof card.body === 'string' ? card.body.replace(/\r\n/g, '\n').replace(/\s+$/, '') : ''
  return `${lines.join('\n')}${body === '' ? '' : `\n${body}\n`}`
}

/**
 * Validate and default a field set.
 * @param input - partially known fields.
 * @returns a complete field set with trimmed, de-duplicated lists.
 * @throws Error for an invalid id, title or version.
 */
export function normalizeFields(input?: RoleFieldInput | null): RoleFields {
  const id = String(input?.id ?? '').trim()
  if (!ROLE_ID.test(id)) throw new Error(`invalid role id "${id}"`)
  const title = String(input?.title ?? '').trim()
  if (title === '') throw new Error(`role "${id}" needs a title`)
  const version = input?.version === undefined ? 1 : Number(input.version)
  if (!Number.isSafeInteger(version) || version < 1) throw new Error(`invalid version for role "${id}"`)
  const model = String(input?.model ?? '').trim()
  if (model !== '' && !MODEL_REF.test(model)) {
    throw new Error(`role "${id}" has an invalid model "${model}" (use model or provider/model)`)
  }

  const fields: RoleFields = { id, title, version, model, capabilities: [], skills: [], handoffs: [], can: [] }
  for (const key of LIST_KEYS) fields[key] = unique(parseList(input?.[key]))
  for (const grant of fields.can) {
    if (!GRANTS.includes(grant)) throw new Error(`role "${id}" declares unknown grant "${grant}"`)
  }
  return fields
}

/** @param value - candidate title. @returns the title, quoted when YAML would misread it. */
function quoteIfNeeded(value: unknown): string {
  const text = String(value)
  if (text === '' || /^[\s\-?:,[\]{}#&*!|>'"%@`]/.test(text) || /:\s|\s#/.test(text)) {
    return JSON.stringify(text)
  }
  return text
}

/**
 * Split frontmatter from body.
 * @param text - full file contents.
 * @returns raw scalar strings per key, plus the body.
 */
function splitFrontmatter(text: string): { raw: Record<string, string>; body: string } {
  const clean = String(text ?? '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(clean)
  if (!match) throw new Error('role card must start with a "---" frontmatter block')
  // The regex has two capture groups, so the defaults below are unreachable.
  const [whole = '', block = ''] = match
  return { raw: parseRaw(block), body: clean.slice(whole.length).replace(/^\n+/, '') }
}

/**
 * Parse `key: value` lines, honouring quoted scalars and folded blocks.
 * @param block - frontmatter lines between the fences.
 * @returns raw string values keyed by field name.
 */
function parseRaw(block: string): Record<string, string> {
  const raw: Record<string, string> = {}
  const lines = block.split('\n')
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^([A-Za-z][A-Za-z0-9_-]*):[ \t]*(.*)$/.exec(lines[index] ?? '')
    if (!match) continue
    // Both groups always captured when the pattern matched.
    const [, key = '', rest = ''] = match
    let value = rest.trim()
    if (/^[>|][+-]?$/.test(value)) {
      const collected: string[] = []
      while (index + 1 < lines.length) {
        const next = lines[index + 1] ?? ''
        if (next.trim() === '') {
          index += 1
          continue
        }
        if (!/^[ \t]+\S/.test(next)) break
        collected.push(next.trim())
        index += 1
      }
      value = collected.join(' ')
    }
    raw[key] = value
  }
  return raw
}

/**
 * Interpret one raw scalar.
 * @param value - raw text, possibly quoted or empty.
 * @returns the unquoted text, or undefined when the key is absent.
 */
function scalar(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const text = String(value).trim()
  if (text.length >= 2) {
    // `charAt` rather than indexing: the two positions are proven present above.
    const first = text.charAt(0)
    const last = text.charAt(text.length - 1)
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) return text.slice(1, -1).trim()
  }
  return text
}

/**
 * Parse a comma-separated list value.
 * @param value - list text, an array, or undefined.
 * @returns trimmed, de-duplicated entries in input order.
 */
export function parseList(value: unknown): string[] {
  if (value === undefined || value === null) return []
  const parts = Array.isArray(value) ? value.map(String) : String(value).split(',')
  return unique(parts.map((entry) => entry.trim().replace(/^\[|\]$/g, '').trim()).filter((entry) => entry !== ''))
}

/**
 * Drop duplicates while keeping the first occurrence.
 * @param values - candidate strings.
 * @returns the de-duplicated list.
 */
function unique(values: string[]): string[] {
  return [...new Set(values)]
}
