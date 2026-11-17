/**
 * Store drafts: discovery, reading, writing, approval, and rejection.
 *
 * A draft mirrors one page under `drafts/`, records the body hash it was
 * written against, and survives a rejection so the author can see why. The
 * decision functions live in `draft.ts`; this module only wires them to paths.
 *
 * @module @chrock-hyper/dsh-hyper-wiki/store/drafts
 */
import { existsSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

import type { GitCommitResult } from '../git.ts'
import {
  decideApprove,
  decideReject,
  DRAFT_PREFIX,
  draftPathOf,
  NEW_BASE,
  parseDraft,
  serializeDraft,
} from '../draft.ts'
import type { DraftBlock } from '../draft.ts'
import {
  displayTitle,
  isPageStatus,
  isoInstant,
  isoTimestamp,
  normalizePagePath,
  normalizeTags,
  parsePage,
  sha1Hex,
} from '../page.ts'
import type { StoreFailure } from '../page.ts'
import { writeFileAtomic } from '../scopes.ts'
import type { ScopeKind, WikiScope } from '../scopes.ts'
import { readText, walkDrafts } from './fs.ts'

/** One draft as the list and status actions report it. */
export interface DraftRow {
  scope: ScopeKind
  path: string
  draftPath: string
  text: string
  title: string
  status: string
  author: string
  base: string
  updated: string
  reason: string
  stale: boolean
  errors: string[]
}

/** One draft plus the metadata a read returns. */
export interface DraftView {
  ok: true
  path: string
  draftPath: string
  text: string
  title: string
  draft: DraftBlock
  stale: boolean
  errors: string[]
}

/** Reading one draft either succeeds or reports why not. */
export type DraftReadResult = DraftView | StoreFailure

/** Writing one draft reports what it recorded. */
export interface DraftWriteOk {
  ok: true
  path: string
  draftPath: string
  base: string
  created: boolean
  replaced: boolean
  stale: boolean
  author: string
}

/** Writing one draft either succeeds or reports why not. */
export type DraftWriteResult = DraftWriteOk | StoreFailure

/** Approving one draft reports what it wrote. */
export interface ApprovalView {
  ok: true
  path: string
  created: boolean
  forced: boolean
  author: string
  commit: GitCommitResult | undefined
}

/** Approving one draft either succeeds or reports why not. */
export type ApprovalResult = ApprovalView | StoreFailure

/** Rejecting one draft reports the rewritten mirror. */
export interface RejectionView {
  ok: true
  path: string
  draftPath: string
  reason: string
}

/** Rejecting one draft either succeeds or reports why not. */
export type RejectionResult = RejectionView | StoreFailure

/** Fields `writeDraft` reads. */
export interface DraftWriteInput {
  path?: unknown
  content?: unknown
  title?: unknown
  tags?: unknown
  status?: unknown
  author?: unknown
}

/** Fields `approve` reads. */
export interface DraftApproveInput {
  path?: unknown
  force?: unknown
  actor?: unknown
}

/** Fields `reject` reads. */
export interface DraftRejectInput {
  path?: unknown
  reason?: unknown
}

/** What `createDraftOps` needs from the facade. */
export interface DraftOpsOptions {
  now: () => Date
  commit: (scope: WikiScope, message: string) => GitCommitResult | undefined
}

/**
 * Build the draft lifecycle.
 * @param options - the clock and the scope commit used after approval.
 * @returns the draft API the facade composes.
 */
export function createDraftOps(options: DraftOpsOptions) {
  const now = options.now
  const commitScope = options.commit

  /**
   * Every draft in one scope.
   * @param scope - scope descriptor.
   * @returns parsed drafts, sorted by page path.
   */
  const drafts = (scope: WikiScope): DraftRow[] => {
    const root = join(scope.wikiDir, DRAFT_PREFIX)
    const rows: DraftRow[] = []
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
  const draftBaseMatches = (scope: WikiScope, pagePath: string, base: string): boolean => {
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
  const readDraft = (scope: WikiScope, rawPath: unknown): DraftReadResult => {
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
  const writeDraft = (scope: WikiScope, input: DraftWriteInput): DraftWriteResult => {
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
    const currentStatus = current?.status
    const status = isPageStatus(rawStatus)
      ? rawStatus
      : isPageStatus(currentStatus)
        ? currentStatus
        : 'wip'
    const draftFile = join(scope.wikiDir, ...draftPathOf(pagePath).split('/'))
    const existed = existsSync(draftFile)
    const author = typeof input.author === 'string' && input.author !== '' ? input.author : 'agent'
    const draftText = serializeDraft({
      title,
      tags,
      status,
      updated: isoTimestamp(now()),
      draft: {
        status: 'pending',
        author,
        base,
        updated: isoInstant(now()),
      },
      body: proposed.body,
    })
    try {
      writeFileAtomic(draftFile, draftText)
    } catch (error) {
      return { ok: false, code: 'write_failed', message: String((error as { message?: unknown } | null)?.message ?? error) }
    }
    return {
      ok: true,
      path: pagePath,
      draftPath: draftPathOf(pagePath),
      base,
      created: !existed,
      replaced: existed,
      stale: !draftBaseMatches(scope, pagePath, base),
      author,
    }
  }

  /**
   * Approve one draft into its page.
   * @param scope - scope descriptor.
   * @param input - `path`, `force`, and the actor recorded in the commit.
   * @returns the write outcome.
   */
  const approve = (scope: WikiScope, input: DraftApproveInput): ApprovalResult => {
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
      return { ok: false, code: 'write_failed', message: String((error as { message?: unknown } | null)?.message ?? error) }
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
  const reject = (scope: WikiScope, input: DraftRejectInput): RejectionResult => {
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
      return { ok: false, code: 'write_failed', message: String((error as { message?: unknown } | null)?.message ?? error) }
    }
    return { ok: true, path: normalized.path, draftPath: draftPathOf(normalized.path), reason: String(input?.reason ?? '') }
  }

  /**
   * Count drafts awaiting review.
   * @param scope - scope descriptor.
   * @returns the pending count.
   */
  const pending = (scope: WikiScope): number => drafts(scope).filter(row => row.status === 'pending').length

  return { drafts, readDraft, writeDraft, approve, reject, pending }
}
