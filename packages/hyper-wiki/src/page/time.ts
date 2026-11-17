/**
 * Page clocks: the two timestamp formats the store writes.
 *
 * `updated` is a human-facing calendar date, while draft bookkeeping keeps a
 * precise UTC instant. Both take an injectable clock so tests control them.
 *
 * @module @chrock-hyper/dsh-hyper-wiki/page/time
 */

/**
 * The local calendar date in ISO form.
 *
 * `updated` is a human-facing field, so it follows the author's calendar
 * rather than UTC: approving at 03:00 local time should not stamp yesterday.
 * Draft timestamps keep the precise UTC instant (`isoInstant`).
 * @param now - clock injection for tests.
 * @returns `YYYY-MM-DD`.
 */
export function isoTimestamp(now: Date | number | string = new Date()): string {
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
export function isoInstant(now: Date | number | string = new Date()): string {
  const date = now instanceof Date ? now : new Date(now)
  return date.toISOString()
}
