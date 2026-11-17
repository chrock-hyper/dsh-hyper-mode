/**
 * Links and backlinks.
 *
 * The wiki supports one link form: a relative Markdown link to another page,
 * such as `[术语](./dir/page.md)`. `[[wikilinks]]` are deliberately not a
 * feature. A backlink is the inverse: every page whose links normalize to the
 * target page id.
 *
 * @module @chrock-hyper/dsh-hyper-wiki/links
 */
import { normalizePagePath, RESERVED_SEGMENTS } from './page.ts'

/** Fenced code blocks, whose contents are not links. */
const FENCE = /^[ \t]{0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]{0,3}\1[^\n]*$/gm

/** Inline code spans, whose contents are not links. */
const INLINE_CODE = /`[^`\n]*`/g

/** Markdown images, matched before links so `![alt](x)` is never a link. */
const IMAGE = /!\[[^\]]*\]\([^)]*\)/g

/** A Markdown inline link: `[text](destination "title")`. */
const LINK = /\[[^\]]*\]\(\s*(<[^>\n]*>|[^)\s]+)(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g

/** A URI scheme such as `https:` or `mailto:`. */
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/

/** The page fields backlink extraction reads. */
export interface LinkablePage {
  path?: unknown
  title?: unknown
  body?: unknown
}

/** One inbound link. */
export interface BacklinkRow {
  path: string
  title: string
}

/**
 * Remove the parts of a Markdown document that hold no links.
 * @param text - Markdown body.
 * @returns the body with code blocks, code spans, and images blanked.
 */
function stripNonLinks(text: unknown): string {
  return String(text ?? '')
    .replace(FENCE, '')
    .replace(INLINE_CODE, '')
    .replace(IMAGE, '')
}

/**
 * Resolve one link destination to a page id.
 * @param destination - raw link destination.
 * @param fromPath - the page the link appears in.
 * @returns the target page id, or undefined when the link is not a page link.
 */
export function resolveLink(destination: unknown, fromPath: unknown): string | undefined {
  let target = String(destination ?? '').trim()
  if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1).trim()
  if (target === '') return undefined
  if (target.startsWith('#')) return undefined
  if (target.startsWith('//')) return undefined
  if (SCHEME.test(target)) return undefined
  if (target.startsWith('/')) return undefined
  // Both splits always keep their first component; `?? ''` is for the index check.
  target = target.split('#')[0]?.split('?')[0] ?? ''
  if (target === '') return undefined
  try {
    target = decodeURIComponent(target)
  } catch {
    // A malformed escape stays literal; the segment walk reports it if it matters.
  }
  if (!target.endsWith('.md')) return undefined
  const from = normalizePagePath(fromPath)
  const stack = from.ok ? from.path.split('/').slice(0, -1) : []
  for (const segment of target.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      // Walking above the wiki root is not a page link.
      if (stack.length === 0) return undefined
      stack.pop()
      continue
    }
    stack.push(segment)
  }
  const normalized = normalizePagePath(stack.join('/'))
  if (!normalized.ok) return undefined
  const head = normalized.path.split('/')[0]
  if (head !== undefined && RESERVED_SEGMENTS.includes(head)) return undefined
  return normalized.path
}

/**
 * Extract every page link from one page body.
 * @param text - Markdown body.
 * @param fromPath - the page the body belongs to.
 * @returns unique target page ids in document order.
 */
export function extractLinks(text: unknown, fromPath: unknown): string[] {
  const source = stripNonLinks(text)
  const targets: string[] = []
  for (const match of source.matchAll(LINK)) {
    const target = resolveLink(match[1], fromPath)
    if (target !== undefined && !targets.includes(target)) targets.push(target)
  }
  return targets
}

/**
 * Invert links for one target page.
 * @param pages - `{ path, title, body }` entries for the whole store.
 * @param targetPath - the page whose backlinks are wanted.
 * @returns linking pages as `{ path, title }`, sorted by path, without the
 *   target itself.
 */
export function backlinksOf(pages: readonly LinkablePage[], targetPath: unknown): BacklinkRow[] {
  const target = normalizePagePath(targetPath)
  if (!target.ok) return []
  const found: BacklinkRow[] = []
  for (const page of pages) {
    const pagePath = normalizePagePath(page?.path)
    if (!pagePath.ok || pagePath.path === target.path) continue
    const links = extractLinks(page.body ?? '', pagePath.path)
    if (!links.includes(target.path)) continue
    found.push({
      path: pagePath.path,
      title: typeof page.title === 'string' && page.title.trim() !== '' ? page.title : pagePath.path,
    })
  }
  found.sort((left, right) => left.path.localeCompare(right.path))
  return found
}
