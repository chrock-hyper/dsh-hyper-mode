/**
 * The wiki store: filesystem effects behind one scope.
 *
 * Everything that touches a disk lives here — listing, reading, drafts,
 * approval, rejection, deletion, rename, and the optional global-scope git
 * commit. The text decisions themselves live in `page.js`, `draft.js`,
 * `links.js`, and `search.js`, so this module only wires them to paths.
 *
 * Every mutating entry point returns `{ ok: true, … }` or
 * `{ ok: false, code, message }`; none of them throws for a wiki-level
 * problem, and a git failure never fails the mutation.
 *
 * @module dsh-wiki/lib/store
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

import {
  decideApprove,
  decideReject,
  DRAFT_PREFIX,
  draftPathOf,
  NEW_BASE,
  parseDraft,
  serializeDraft,
} from './draft.js'
import { backlinksOf } from './links.js'
import {
  displayTitle,
  isPageStatus,
  isoInstant,
  isoTimestamp,
  normalizePagePath,
  normalizeTags,
  parsePage,
  serializePage,
  sha1Hex,
} from './page.js'
import { DEFAULT_LIMIT, searchPages, toSummary } from './search.js'
import { writeFileAtomic } from './scopes.js'

/** Largest page file read; larger files are reported rather than loaded. */
const MAX_PAGE_BYTES = 1024 * 1024

/** Directory holding deleted pages. */
const TRASH_PREFIX = '.trash'

/**
 * Build the store.
 * @param options - `scopes` index, `git` helper, logger, result ceiling, and a
 *   clock.
 * @returns the store API the tools, routes, and prompt share.
 */
export function createWikiStore(options) {
  const scopes = options.scopes
  const git = options.git
  const log = options.logger ?? {}
  const maxResults = Number.isFinite(options.maxResults) && options.maxResults > 0
    ? Math.floor(options.maxResults)
    : DEFAULT_LIMIT
  const now = typeof options.now === 'function' ? options.now : () => new Date()

  /**
   * Report whether a scope holds a wiki.
   * @param scope - scope descriptor.
   * @returns the presence flag.
   */
  const hasWiki = scope => scopes.hasWiki(scope)

  /**
   * Read one file, bounded.
   * @param file - absolute path.
   * @returns the text, or undefined when absent or too large.
   */
  const readText = file => {
    try {
      const stat = statSync(file)
      if (!stat.isFile() || stat.size > MAX_PAGE_BYTES) return undefined
      return readFileSync(file, 'utf8')
    } catch {
      return undefined
    }
  }

  /**
   * Walk every Markdown file below a directory.
   * @param dir - absolute directory to scan.
   * @param base - the directory the returned ids are relative to.
   * @param depth - current depth, used to keep the reserved top-level names
   *   out of the page tree only at the root.
   * @returns relative POSIX paths.
   */
  const walk = (dir, base, depth = 0) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return []
    }
    const found = []
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.name.startsWith('.')) continue
      if (depth === 0 && (entry.name === DRAFT_PREFIX || entry.name === TRASH_PREFIX)) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        found.push(...walk(full, base, depth + 1))
        continue
      }
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue
      found.push(full.slice(base.length + 1).split(/[\\/]/).join('/'))
    }
    return found
  }

  /**
   * Load every page of one scope.
   * @param scope - scope descriptor.
   * @returns parsed pages carrying `scope` and `path`.
   */
  const pages = scope => {
    const rows = []
    for (const path of walk(scope.wikiDir, scope.wikiDir)) {
      const text = readText(join(scope.wikiDir, ...path.split('/')))
      if (text === undefined) continue
      const page = parsePage(text)
      rows.push({ ...page, scope: scope.scope, path, text })
    }
    rows.sort((left, right) => left.path.localeCompare(right.path))
    return rows
  }

  /**
   * The page list of one scope.
   * @param scope - scope descriptor.
   * @returns public summaries.
   */
  const list = scope => pages(scope).map(page => toSummary(page))

  /**
   * Read one page plus its draft and backlinks.
   * @param scope - scope descriptor.
   * @param rawPath - page id.
   * @returns the page view, or a `not_found` / `invalid_path` failure.
   */
  const read = (scope, rawPath) => {
    const normalized = normalizePagePath(rawPath)
    if (!normalized.ok) return normalized
    const file = join(scope.wikiDir, ...normalized.path.split('/'))
    const text = readText(file)
    if (text === undefined) {
      return { ok: false, code: 'not_found', message: `no such page: ${normalized.path}` }
    }
    const page = parsePage(text)
    const draft = readDraft(scope, normalized.path)
    return {
      ok: true,
      scope: scope.scope,
      path: normalized.path,
      title: displayTitle(page, normalized.path),
      tags: page.tags,
      status: page.status ?? 'unknown',
      updated: page.updated ?? '',
      body: page.body,
      text,
      errors: page.errors,
      draft: draft.ok ? { ...draft.draft, stale: draft.stale, body: parseDraft(draft.text).body } : null,
      backlinks: backlinksOf(pages(scope), normalized.path),
    }
  }

  /**
   * Whether one page exists in a scope.
   * @param scope - scope descriptor.
   * @param rawPath - page id.
   * @returns the presence flag; an invalid id is absent.
   */
  const hasPage = (scope, rawPath) => {
    const normalized = normalizePagePath(rawPath)
    if (!normalized.ok) return false
    return existsSync(join(scope.wikiDir, ...normalized.path.split('/')))
  }

  /**
   * Search one scope.
   * @param scope - scope descriptor.
   * @param query - raw query text.
   * @param limit - optional ceiling.
   * @returns ranked summaries.
   */
  const search = (scope, query, limit = maxResults) => searchPages(pages(scope), query, limit)

  /**
   * Inbound links to one page.
   * @param scope - scope descriptor.
   * @param rawPath - page id.
   * @returns `{ ok, path, backlinks }`, or `not_found` when the page is absent.
   */
  const backlinks = (scope, rawPath) => {
    const normalized = normalizePagePath(rawPath)
    if (!normalized.ok) return normalized
    const all = pages(scope)
    if (!all.some(page => page.path === normalized.path)) {
      return { ok: false, code: 'not_found', message: `no such page: ${normalized.path}` }
    }
    return { ok: true, path: normalized.path, backlinks: backlinksOf(all, normalized.path) }
  }

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
   * Walk the drafts directory, where the reserved-name rules do not apply.
   * @param dir - absolute drafts directory.
   * @param base - the directory the returned page ids are relative to.
   * @returns page ids the drafts mirror.
   */
  const walkDrafts = (dir, base) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return []
    }
    const found = []
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      if (entry.name.startsWith('.')) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        found.push(...walkDrafts(full, base))
        continue
      }
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue
      found.push(full.slice(base.length + 1).split(/[\\/]/).join('/'))
    }
    return found
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
   * Move a page into `.trash/`.
   * @param scope - scope descriptor.
   * @param rawPath - page id.
   * @returns the trash path and the pages that still link to it.
   */
  const remove = (scope, rawPath) => {
    const normalized = normalizePagePath(rawPath)
    if (!normalized.ok) return normalized
    const pageFile = join(scope.wikiDir, ...normalized.path.split('/'))
    if (!existsSync(pageFile)) {
      return { ok: false, code: 'not_found', message: `no such page: ${normalized.path}` }
    }
    const affected = backlinksOf(pages(scope), normalized.path)
    const stamp = trashStamp(now())
    const trashRelative = `${TRASH_PREFIX}/${normalized.path}.${stamp}.md`
    const trashFile = join(scope.wikiDir, ...trashRelative.split('/'))
    try {
      mkdirSync(dirname(trashFile), { recursive: true })
      renameSync(pageFile, trashFile)
    } catch (error) {
      return { ok: false, code: 'write_failed', message: String(error?.message ?? error) }
    }
    const commit = commitScope(scope, `wiki: delete ${normalized.path}`)
    return { ok: true, path: normalized.path, trashPath: trashRelative, backlinks: affected, commit }
  }

  /**
   * Move a page to a new id, reporting the pages that link to the old one.
   * @param scope - scope descriptor.
   * @param input - `from` and `to` page ids.
   * @returns the move outcome; other pages are never rewritten.
   */
  const rename = (scope, input) => {
    const from = normalizePagePath(input?.from)
    if (!from.ok) return from
    const to = normalizePagePath(input?.to)
    if (!to.ok) return to
    if (from.path === to.path) {
      return { ok: false, code: 'invalid_path', message: 'from and to are the same page' }
    }
    const fromFile = join(scope.wikiDir, ...from.path.split('/'))
    const toFile = join(scope.wikiDir, ...to.path.split('/'))
    if (!existsSync(fromFile)) {
      return { ok: false, code: 'not_found', message: `no such page: ${from.path}` }
    }
    if (existsSync(toFile)) {
      return { ok: false, code: 'conflict', message: `target exists: ${to.path}` }
    }
    const affected = backlinksOf(pages(scope), from.path)
    const draftFile = join(scope.wikiDir, ...draftPathOf(from.path).split('/'))
    const draftLeftBehind = existsSync(draftFile)
    try {
      mkdirSync(dirname(toFile), { recursive: true })
      renameSync(fromFile, toFile)
    } catch (error) {
      return { ok: false, code: 'write_failed', message: String(error?.message ?? error) }
    }
    const commit = commitScope(scope, `wiki: rename ${from.path} -> ${to.path}`)
    return {
      ok: true,
      from: from.path,
      to: to.path,
      backlinks: affected,
      draftLeftBehind,
      commit,
    }
  }

  /**
   * Write a page directly (the panel's editor — never a tool action).
   * @param scope - scope descriptor.
   * @param input - `path` and full page `content`.
   * @returns the write outcome.
   */
  const writePage = (scope, input) => {
    const normalized = normalizePagePath(input?.path)
    if (!normalized.ok) return normalized
    if (typeof input?.content !== 'string' || input.content.trim() === '') {
      return { ok: false, code: 'invalid_content', message: 'content is required' }
    }
    const page = parsePage(input.content)
    if (page.status !== undefined && page.status !== '' && !isPageStatus(page.status)) {
      return { ok: false, code: 'invalid_status', message: `invalid status: ${page.status}` }
    }
    const file = join(scope.wikiDir, ...normalized.path.split('/'))
    const created = !existsSync(file)
    const text = serializePage({
      title: page.title,
      tags: page.tags,
      status: isPageStatus(page.status) ? page.status : 'wip',
      updated: isoTimestamp(now()),
      body: page.body,
    })
    try {
      writeFileAtomic(file, text)
    } catch (error) {
      return { ok: false, code: 'write_failed', message: String(error?.message ?? error) }
    }
    const commit = commitScope(scope, `wiki: ${created ? 'create' : 'edit'} ${normalized.path}`)
    return { ok: true, path: normalized.path, created, commit }
  }

  /**
   * Count drafts awaiting review.
   * @param scope - scope descriptor.
   * @returns the pending count.
   */
  const pending = scope => drafts(scope).filter(row => row.status === 'pending').length

  /**
   * Commit a change when the scope keeps history.
   * @param scope - scope descriptor.
   * @param message - commit subject.
   * @returns the commit outcome, or undefined for a scope without history.
   */
  const commitScope = (scope, message) => {
    if (scope.git !== true) return undefined
    try {
      return git.commit(scope.wikiDir, message)
    } catch (error) {
      log.warn?.(`dsh-wiki: git commit failed: ${error?.message ?? error}`)
      return { committed: false, reason: 'git commit failed' }
    }
  }

  /**
   * The panel view of both scopes.
   * @param cwd - a directory the panel knows about.
   * @returns scope rows with presence and pending counts.
   */
  const scopeState = cwd => {
    const rows = []
    for (const scope of scopes.listScopes(cwd)) {
      const present = hasWiki(scope)
      rows.push({
        scope: scope.scope,
        root: scope.root,
        wikiDir: scope.wikiDir,
        contract: scope.contractFile,
        git: scope.git === true,
        exists: present,
        pages: list(scope).length,
        pending: pending(scope),
      })
    }
    return { scopes: rows, recentProjects: scopes.readRecent() }
  }

  return {
    scopes,
    maxResults,
    hasWiki,
    pages,
    list,
    hasPage,
    read,
    search,
    backlinks,
    drafts,
    readDraft,
    writeDraft,
    approve,
    reject,
    remove,
    rename,
    writePage,
    pending,
    scopeState,
  }
}

/**
 * A filesystem-safe UTC stamp for a trashed page.
 * @param date - the clock value.
 * @returns `YYYYMMDDTHHMMSSmmmZ`.
 */
export function trashStamp(date) {
  return isoInstant(date).replace(/[-:.]/g, '')
}
