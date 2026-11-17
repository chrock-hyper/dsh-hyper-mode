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
 * This module is the facade over `page/`: importers keep using `page.js`.
 *
 * @module @chrock-studio/dsh-hyper-wiki/page
 */
export {
  isPageStatus,
  normalizeTags,
  PAGE_STATUSES,
  parsePage,
  quote,
  serializePage,
  splitFrontmatter,
  unquote,
} from './page/frontmatter.ts'
export { sha1Hex } from './page/hash.ts'
export {
  displayTitle,
  normalizePagePath,
  RESERVED_SEGMENTS,
  stemOf,
} from './page/paths.ts'
export type {
  PagePathFailure,
  PagePathOk,
  PagePathResult,
  StoreFailure,
} from './page/paths.ts'
export type { ParsedPage, PageInput, PageStatus } from './page/frontmatter.ts'
export { isoInstant, isoTimestamp } from './page/time.ts'
