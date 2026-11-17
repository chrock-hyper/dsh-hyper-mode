/**
 * Pure text projections over role store files: notes parsing and card
 * summaries. No filesystem access lives here.
 *
 * @module @chrock-studio/dsh-hyper-roles/store/text
 */

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
