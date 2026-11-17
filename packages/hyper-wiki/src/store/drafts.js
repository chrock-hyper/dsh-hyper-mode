/**
 * Store drafts: discovery, reading, writing, approval, and rejection.
 *
 * A draft mirrors one page under `drafts/`, records the body hash it was
 * written against, and survives a rejection so the author can see why. The
 * decision functions live in `draft.js`; this module only wires them to paths.
 *
 * @module @chrock-studio/dsh-hyper-wiki/store/drafts
 */
import { existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

import {
  decideApprove,
  decideReject,
  DRAFT_PREFIX,
  draftPathOf,
  NEW_BASE,
  parseDraft,
  serializeDraft,
} from '../draft.js'
import {
  displayTitle,
  isPageStatus,
  isoInstant,
  isoTimestamp,
  normalizePagePath,
  normalizeTags,
  parsePage,
  sha1Hex,
} from '../page.js'
import { writeFileAtomic } from '../scopes.js'
import { readText, walkDrafts } from './fs.js'

/**
 * Build the draft lifecycle.
 * @param options - the clock and the scope commit used after approval.
 * @returns the draft API the facade composes.
 */
export function createDraftOps(options) {
  const now = options.now
  const commitScope = options.commit

  /**
   * Every draft in one scope.
   * @param scope - scope descriptor.
   * @returns parsed drafts, sorted by page path.
   */
  const drafts = scope => {
    const root = join(scope.wikiDir, DRAFT_PREFIX)
    const rows = []
    for (const draftPath of walkDrafts(root, root)) {
      const text = readText(join(root, ...draftPath.split('/')))
      if (text === undefined) continue
      const pagePath = draftPath
      const parsed = parseDraft(text)
      rows.push({
        scope: scope.scope,
        path: pagePath,
        draftPath: `${DRAFT_PREFIX}/${pagePath}`,
        text,
        title: displayTitle(parsed.page, pagePath),
        status: parsed.draft.status,
        author: parsed.draft.author,
        base: parsed.draft.base,
        updated: parsed.draft.updated,
        reason: parsed.draft.reason,
        stale: !draftBaseMatches(scope, pagePath, parsed.draft.base),
        errors: parsed.errors,
      })
    }
    rows.sort((left, right) => left.path.localeCompare(right.path))
    return rows
  }

  /**
   * Whether a draft's base still matches its page.
   * @param scope - scope descriptor.
   * @param pagePath - page id.
   * @param base - the draft's recorded base.
   * @returns the match flag.
   */
  const draftBaseMatches = (scope, pagePath, base) => {
    const text = readText(join(scope.wikiDir, ...pagePath.split('/')))
    if (base === NEW_BASE) return text === undefined
    if (text === undefined) return false
    return sha1Hex(parsePage(text).body) === base
  }

  /**
   * Read one draft.
   * @param scope - scope descriptor.
   * @param rawPath - page id the draft mirrors.
   * @returns `{ ok, path, draft }` or a failure.
   */
  const readDraft = (scope, rawPath) => {
    const normalized = normalizePagePath(rawPath)
    if (!normalized.ok) return normalized
    const text = readText(join(scope.wikiDir, ...draftPathOf(normalized.path).split('/')))
    if (text === undefined) {
      return { ok: false, code: 'not_found', message: `no draft for ${normalized.path}` }
    }
    const parsed = parseDraft(text)
    return {
      ok: true,
      path: normalized.path,
      draftPath: draftPathOf(normalized.path),
      text,
      title: displayTitle(parsed.page, normalized.path),
      draft: {
        status: parsed.draft.status,
        author: parsed.draft.author,
        base: parsed.draft.base,
        updated: parsed.draft.updated,
        reason: parsed.draft.reason,
      },
      stale: !draftBaseMatches(scope, normalized.path, parsed.draft.base),
      errors: parsed.errors,
    }
  }

  /**
   * Write (or replace) the draft for one page.
   *
   * `content` may be a full page document or a bare body; explicit `title`,
   * `tags`, and `status` win over what the content carries.
   * @param scope - scope descriptor.
   * @param input - `path`, `content`, `title`, `tags`, `status`, `author`.
   * @returns the draft path, the base it records, and whether it replaced one.
   */
  const writeDraft = (scope, input) => {
    const normalized = normalizePagePath(input?.path)
    if (!normalized.ok) return normalized
    if (typeof input?.content !== 'string' || input.content.trim() === '') {
      return { ok: false, code: 'invalid_content', message: 'content is required' }
    }
    const pagePath = normalized.path
    const pageFile = join(scope.wikiDir, ...pagePath.split('/'))
    const pageText = readText(pageFile)
    const base = pageText === undefined ? NEW_BASE : sha1Hex(parsePage(pageText).body)
    const proposed = parsePage(input.content)
    const current = pageText === undefined ? undefined : parsePage(pageText)
    const title = typeof input.title === 'string' && input.title.trim() !== ''
      ? input.title.trim()
      : proposed.title.trim() !== ''
        ? proposed.title
        : current !== undefined && current.title.trim() !== ''
          ? current.title
          : displayTitle({ title: '' }, pagePath)
    const providedTags = input.tags === undefined ? [] : normalizeTags(input.tags)
    const tags = providedTags.length > 0
      ? providedTags
      : proposed.tags.length > 0
        ? proposed.tags
        : normalizeTags(current?.tags)
    const rawStatus = typeof input.status === 'string' && input.status !== '' ? input.status : proposed.status
    const status = isPageStatus(rawStatus)
      ? rawStatus
      : isPageStatus(current?.status)
        ? current.status
        : 'wip'
    const draftFile = join(scope.wikiDir, ...draftPathOf(pagePath).split('/'))
    const existed = existsSync(draftFile)
    const draftText = serializeDraft({
      title,
      tags,
      status,
      updated: isoTimestamp(now()),
      draft: {
        status: 'pending',
        author: typeof input.author === 'string' && input.author !== '' ? input.author : 'agent',
        base,
        updated: isoInstant(now()),
      },
      body: proposed.body,
    })
    try {
      writeFileAtomic(draftFile, draftText)
    } catch (error) {
      return { ok: false, code: 'write_failed', message: String(error?.message ?? error) }
    }
    return {
      ok: true,
      path: pagePath,
      draftPath: draftPathOf(pagePath),
      base,
      created: !existed,
      replaced: existed,
      stale: !draftBaseMatches(scope, pagePath, base),
      author: typeof input.author === 'string' && input.author !== '' ? input.author : 'agent',
    }
  }

  /**
   * Approve one draft into its page.
   * @param scope - scope descriptor.
   * @param input - `path`, `force`, and the actor recorded in the commit.
   * @returns the write outcome.
   */
  const approve = (scope, input) => {
    const normalized = normalizePagePath(input?.path)
    if (!normalized.ok) return normalized
    const pagePath = normalized.path
    const draftFile = join(scope.wikiDir, ...draftPathOf(pagePath).split('/'))
    const draftText = readText(draftFile)
    if (draftText === undefined) {
      return { ok: false, code: 'not_found', message: `no draft for ${pagePath}` }
    }
    const pageFile = join(scope.wikiDir, ...pagePath.split('/'))
    const pageText = readText(pageFile)
    const decision = decideApprove({
      pageText: pageText ?? null,
      draftText,
      path: pagePath,
      force: input?.force === true,
      now: now(),
    })
    if (!decision.ok) return decision
    try {
      writeFileAtomic(pageFile, decision.pageText)
      unlinkSync(draftFile)
    } catch (error) {
      return { ok: false, code: 'write_failed', message: String(error?.message ?? error) }
    }
    const commit = commitScope(scope, `wiki: approve ${pagePath}${input?.actor ? ` by ${input.actor}` : ''}`)
    return {
      ok: true,
      path: pagePath,
      created: decision.created,
      forced: input?.force === true,
      author: decision.author,
      commit,
    }
  }

  /**
   * Reject one draft, keeping it with a reason.
   * @param scope - scope descriptor.
   * @param input - `path` and `reason`.
   * @returns the rewrite outcome.
   */
  const reject = (scope, input) => {
    const normalized = normalizePagePath(input?.path)
    if (!normalized.ok) return normalized
    const draftFile = join(scope.wikiDir, ...draftPathOf(normalized.path).split('/'))
    const draftText = readText(draftFile)
    if (draftText === undefined) {
      return { ok: false, code: 'not_found', message: `no draft for ${normalized.path}` }
    }
    const decision = decideReject({ draftText, path: normalized.path, reason: input?.reason, now: now() })
    if (!decision.ok) return decision
    try {
      writeFileAtomic(draftFile, decision.draftText)
    } catch (error) {
      return { ok: false, code: 'write_failed', message: String(error?.message ?? error) }
    }
    return { ok: true, path: normalized.path, draftPath: draftPathOf(normalized.path), reason: String(input?.reason ?? '') }
  }

  /**
   * Count drafts awaiting review.
   * @param scope - scope descriptor.
   * @returns the pending count.
   */
  const pending = scope => drafts(scope).filter(row => row.status === 'pending').length

  return { drafts, readDraft, writeDraft, approve, reject, pending }
}
