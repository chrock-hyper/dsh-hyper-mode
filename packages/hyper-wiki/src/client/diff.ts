/**
 * Pure text helpers for the document pane: the preview input and the draft
 * diff. No React, no state, so both can be checked on their own.
 */

/**
 * Drop a leading frontmatter block, for previewing an edited document.
 *
 * @param text - page text.
 * @returns the body.
 */
export function stripFrontmatter(text: string): string {
  const value = String(text || '')
  if (!/^\uFEFF?---\r?\n/.test(value)) return value
  const lines = value.replace(/^\uFEFF/, '').split('\n')
  for (let index = 1; index < lines.length; index += 1) {
    if ((lines[index] ?? '').trim() === '---') {
      return lines.slice(index + 1).join('\n').replace(/^\n/, '')
    }
  }
  return value
}

/**
 * A line-oriented diff: unchanged, removed, and added lines.
 *
 * @param before - current page body.
 * @param after - drafted body.
 * @returns `pre`-ready text with +/- markers.
 */
export function diffLines(before: string, after: string): string {
  const left = String(before || '').split('\n')
  const right = String(after || '').split('\n')
  if (left.length > 1200 || right.length > 1200) {
    return '-' + left.join('\n-') + '\n+' + right.join('\n+')
  }
  const rows: string[] = []
  let prefix = 0
  while (prefix < left.length && prefix < right.length && left[prefix] === right[prefix]) prefix += 1
  let suffix = 0
  while (
    suffix < left.length - prefix
    && suffix < right.length - prefix
    && left[left.length - 1 - suffix] === right[right.length - 1 - suffix]
  ) suffix += 1
  const leftMiddle = left.slice(prefix, left.length - suffix)
  const rightMiddle = right.slice(prefix, right.length - suffix)
  for (let index = 0; index < prefix; index += 1) rows.push(' ' + (left[index] ?? ''))
  if (leftMiddle.length === 0 && rightMiddle.length === 0) {
    return rows.length === 0 ? '' : rows.join('\n')
  }
  for (const line of leftMiddle) rows.push('-' + line)
  for (const line of rightMiddle) rows.push('+' + line)
  for (let index = left.length - suffix; index < left.length; index += 1) rows.push(' ' + (left[index] ?? ''))
  return rows.join('\n')
}
