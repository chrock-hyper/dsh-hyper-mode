/**
 * Formatting between the wire and the form: comma text, card fields, and the
 * panel's editable copy of them.
 *
 * Everything here is pure, so `__test` can expose it and the panel can compare
 * a form against the card it came from without touching React.
 */

/** The editable form: every card field the panel can change, lists kept as arrays. */
export interface RoleForm {
  title: string
  capabilities: string[]
  skills: string[]
  handoffs: string[]
  can: string[]
  model: string
  body: string
}

/** Single-value fields, keyed the same way in the form and in the card. */
export type FieldKey = 'title' | 'model' | 'body'

/** List fields: chips in the form, comma text in the file. */
export type ListKey = 'capabilities' | 'skills' | 'handoffs' | 'can'

/**
 * The fields a card may carry. Every one is optional and typed `unknown`
 * because the panel reads JSON, and a malformed payload must degrade to a
 * blank field instead of a crash.
 */
export interface FormFields {
  title?: unknown
  capabilities?: unknown
  skills?: unknown
  handoffs?: unknown
  can?: unknown
  model?: unknown
}

/**
 * Split comma-separated text into tokens, accepting the full-width comma too.
 * @param value - raw text from an input.
 * @returns trimmed, non-empty tokens.
 */
export function parseList(value: unknown): string[] {
  return String(value || '')
    .split(/[,，]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
}

/**
 * Join tokens back into the comma text the form fields show.
 * @param value - tokens, possibly absent.
 * @returns `a, b`, or `''` for an empty or non-array value.
 */
export function listText(value: unknown): string {
  return Array.isArray(value) ? value.join(', ') : ''
}

/**
 * Render a form object from card fields; list fields stay arrays.
 * @param fields - frontmatter fields from the wire.
 * @param body - card prose.
 * @returns the form the editor edits.
 */
export function formOf(fields: FormFields, body: unknown): RoleForm {
  const list = (value: unknown): string[] => (Array.isArray(value) ? ([...value] as string[]) : [])
  return {
    title: typeof fields.title === 'string' ? fields.title : '',
    capabilities: list(fields.capabilities),
    skills: list(fields.skills),
    handoffs: list(fields.handoffs),
    can: list(fields.can),
    model: typeof fields.model === 'string' ? fields.model : '',
    body: typeof body === 'string' ? body : '',
  }
}

/**
 * Compare two token lists by value and order.
 * @param left - one list.
 * @param right - the other list.
 * @returns true when both hold the same tokens in the same order.
 */
export function sameList(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

/**
 * Read a caught value as a message for the banner.
 * @param failure - any thrown value; an `Error` contributes its message.
 * @returns the message, or the stringified value when there is none.
 */
export function messageOf(failure: unknown): string {
  const message = failure !== null && typeof failure === 'object' ? (failure as { message?: unknown }).message : undefined
  return typeof message === 'string' && message !== '' ? message : String(failure)
}

/**
 * Format a note timestamp as the panel shows it.
 * @param at - ISO timestamp from the notes file.
 * @returns `YYYY-MM-DD HH:MM`, without the seconds and the `T`.
 */
export function formatNoteAt(at: string): string {
  return at.slice(0, 16).replace('T', ' ')
}
