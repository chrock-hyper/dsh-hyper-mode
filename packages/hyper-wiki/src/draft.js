/**
 * Drafts: the reviewable mirror of one page write.
 *
 * A draft lives at `wiki/drafts/<page path>` and carries the page frontmatter
 * the write would produce, plus a `draft:` block recording who proposes it,
 * which page body it was based on, and — after a rejection — why. There is one
 * draft per page: a new draft replaces the previous one.
 *
 * The decisions here are pure functions over file text so the approval state
 * machine can be tested without touching a disk.
 *
 * @module @chrock-studio/dsh-hyper-wiki/draft
 */
import {
  displayTitle,
  isPageStatus,
  isoInstant,
  isoTimestamp,
  normalizeTags,
  parsePage,
  quote,
  serializePage,
  sha1Hex,
} from './page.js'

/** Draft lifecycle values the `draft.status` field may take. */
export const DRAFT_STATUSES = ['pending', 'rejected']

/** Directory holding every draft, relative to the wiki root. */
export const DRAFT_PREFIX = 'drafts'

/** Base marker meaning "this draft proposes a page that does not exist yet". */
export const NEW_BASE = 'new'

/** Field order inside the nested `draft:` block. */
const DRAFT_FIELD_ORDER = ['status', 'author', 'base', 'updated', 'reason']

/**
 * The draft path mirroring a page id.
 * @param pagePath - normalized page id such as `guide/setup.md`.
 * @returns `drafts/guide/setup.md`.
 */
export function draftPathOf(pagePath) {
  return `${DRAFT_PREFIX}/${pagePath}`
}

/**
 * The page id a draft path mirrors.
 * @param draftPath - path relative to the wiki root.
 * @returns the page id, or undefined when the path is not a draft.
 */
export function pagePathOfDraft(draftPath) {
  const value = String(draftPath ?? '')
  if (!value.startsWith(`${DRAFT_PREFIX}/`)) return undefined
  return value.slice(DRAFT_PREFIX.length + 1)
}

/**
 * Parse a draft document.
 * @param text - raw draft file contents.
 * @returns the embedded page fields, the `draft:` block, the body, and any
 *   recoverable complaints.
 */
export function parseDraft(text) {
  const page = parsePage(text)
  const raw = page.fields.draft
  const block = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  const draft = {
    status: typeof block.status === 'string' ? block.status : '',
    author: typeof block.author === 'string' ? block.author : '',
    base: typeof block.base === 'string' ? block.base : '',
    updated: typeof block.updated === 'string' ? block.updated : '',
    reason: typeof block.reason === 'string' ? block.reason : '',
  }
  if (raw === undefined || (typeof raw === 'string' && raw === '')) {
    page.errors.push('draft: missing draft block')
  } else if (draft.status === '') {
    page.errors.push('draft: missing draft.status')
  } else if (!DRAFT_STATUSES.includes(draft.status)) {
    page.errors.push(`draft: invalid draft.status: ${draft.status}`)
  }
  if (draft.base === '') page.errors.push('draft: missing draft.base')
  return { page, draft, body: page.body, errors: page.errors }
}

/**
 * Serialize a draft document.
 * @param options - page fields, the `draft:` block, and the body.
 * @returns the draft document text.
 */
export function serializeDraft(options) {
  const pageText = serializePage({
    title: options.title,
    tags: options.tags,
    status: options.status,
    updated: options.updated,
    body: '',
  })
  // Insert the nested block just before the closing fence.
  const fence = pageText.indexOf('\n---\n')
  const head = pageText.slice(0, fence)
  const values = options.draft ?? {}
  const lines = ['draft:']
  for (const key of DRAFT_FIELD_ORDER) {
    const value = values[key]
    if (value === undefined || value === null || String(value) === '') continue
    lines.push(`  ${key}: ${quote(String(value))}`)
  }
  return `${head}\n${lines.join('\n')}\n---\n\n${options.body ?? ''}`
}

/**
 * Whether a base value still matches a page.
 * @param options - the current page text (or null) and the draft's base.
 * @returns true when the draft may be approved without `force`.
 */
export function baseMatches(options) {
  const { pageText, base } = options
  if (base === NEW_BASE) return pageText === null
  if (pageText === null) return false
  return sha1Hex(parsePage(pageText).body) === base
}

/**
 * Decide what an approval writes.
 * @param options - current page text (null when absent), draft text, the page
 *   id, whether `force` was requested, and the clock.
 * @returns the page text to write, or a `conflict`/`invalid_draft` failure.
 */
export function decideApprove(options) {
  const { pageText = null, draftText, path, force = false, now = new Date() } = options
  const parsed = parseDraft(draftText)
  const draftStatus = parsed.draft.status
  if (draftStatus === '' || !DRAFT_STATUSES.includes(draftStatus)) {
    return { ok: false, code: 'invalid_draft', message: 'draft has no usable draft.status' }
  }
  if (parsed.draft.base === '') {
    return { ok: false, code: 'invalid_draft', message: 'draft has no usable draft.base' }
  }
  if (force !== true && !baseMatches({ pageText, base: parsed.draft.base })) {
    return {
      ok: false,
      code: 'conflict',
      message: parsed.draft.base === NEW_BASE
        ? 'the page already exists; re-draft from the current page or force the approval'
        : 'the page changed after this draft was written; re-draft or force the approval',
    }
  }
  const current = pageText === null ? undefined : parsePage(pageText)
  const fields = resolvePageFields(parsed.page, current, path, isoTimestamp(now))
  return {
    ok: true,
    created: pageText === null,
    base: parsed.draft.base,
    author: parsed.draft.author,
    pageText: serializePage({ ...fields, body: parsed.body }),
  }
}

/**
 * Decide what a rejection writes.
 * @param options - draft text, the page id, the reason, and the clock.
 * @returns the rewritten draft text, or an `invalid_draft` failure.
 */
export function decideReject(options) {
  const { draftText, path, reason = '', now = new Date() } = options
  const parsed = parseDraft(draftText)
  if (parsed.draft.base === '' && parsed.draft.status === '') {
    return { ok: false, code: 'invalid_draft', message: 'draft has no usable draft block' }
  }
  const fields = resolvePageFields(parsed.page, undefined, path, parsed.page.updated)
  const trimmedReason = String(reason ?? '').trim()
  return {
    ok: true,
    draftText: serializeDraft({
      ...fields,
      draft: {
        status: 'rejected',
        author: parsed.draft.author,
        base: parsed.draft.base,
        updated: isoInstant(now),
        reason: trimmedReason === '' ? 'rejected' : trimmedReason,
      },
      body: parsed.body,
    }),
  }
}

/**
 * Merge the page fields a draft carries with what the target page has.
 * @param draftPage - parsed fields from the draft.
 * @param currentPage - parsed fields of the current page, when it exists.
 * @param path - page id, for the title fallback.
 * @param updated - `updated` value to write.
 * @returns the fields the resulting document carries.
 */
function resolvePageFields(draftPage, currentPage, path, updated) {
  const draftTitle = typeof draftPage.title === 'string' ? draftPage.title.trim() : ''
  const currentTitle = typeof currentPage?.title === 'string' ? currentPage.title.trim() : ''
  const title = draftTitle !== ''
    ? draftPage.title
    : currentTitle !== ''
      ? currentPage.title
      : displayTitle({ title: '' }, path)
  const draftTags = normalizeTags(draftPage.tags)
  const tags = draftTags.length > 0 ? draftTags : normalizeTags(currentPage?.tags)
  const status = isPageStatus(draftPage.status)
    ? draftPage.status
    : isPageStatus(currentPage?.status)
      ? currentPage.status
      : 'wip'
  return {
    title,
    tags,
    status,
    updated: updated === undefined || updated === null || updated === '' ? '' : updated,
  }
}
