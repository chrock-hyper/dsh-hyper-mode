/**
 * `dsh-resource://` addresses and the right sidebar's `openResource`.
 *
 * The panel never reads a file: it builds the same address DSH's own sidebar
 * previews read (`@deepseek-ai/dsh-util-workspace-path`'s
 * `sessionFileAddress`) and hands it to `ctx.get('sidebarRight')`. Keeping the
 * encoder here makes the address a testable pure function and gives the panel
 * one failure contract — a boolean, never a throw.
 */

/** DSH's own preview address prefix (same shape as `sessionFileAddress`). */
export const FILE_ADDRESS_PREFIX = 'dsh-resource://file/'

/** The one member the panel uses from `ctx.get('sidebarRight')`. */
export interface SidebarService {
  openResource(address: string): void
}

/** One address segment: encode, but leave `:` readable (DSH's own rule). */
export function encodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/%3A/gi, ':')
}

/** One address path: every `/`-separated segment encoded, `/` kept. */
export function encodePath(path: string): string {
  return path.split('/').map(encodeSegment).join('/')
}

/**
 * Build the address DSH's sidebar previews read.
 *
 * Same shape as `@deepseek-ai/dsh-util-workspace-path`'s `sessionFileAddress`:
 * `dsh-resource://file/session/<sessionId>/<path>`, every segment encoded,
 * `%3A` restored to `:`, backslashes normalized, a leading `./` dropped. An
 * absolute path keeps its absolute spelling, which is why the result has a
 * double slash right after the session id.
 * @param sessionId - durable Session id.
 * @param path - absolute (or workspace-relative) path.
 * @returns the resource address.
 */
export function sessionFileAddress(sessionId: string | null | undefined, path: string | null | undefined): string {
  const normalized = String(path === undefined || path === null ? '' : path)
    .replace(/\\/g, '/')
    .replace(/^(?:\.\/)+/, '')
  return `${FILE_ADDRESS_PREFIX}session/${encodeSegment(String(sessionId === undefined || sessionId === null ? '' : sessionId))}/${encodePath(normalized)}`
}

/**
 * Ask DSH's own right sidebar to show one file.
 *
 * The service is resolved lazily by the caller, so a GUI without it (or a path
 * with no absolute location) reports a reason instead of failing silently.
 * Returns a boolean rather than throwing, because the caller owns the visible
 * error line.
 * @param sidebar - `ctx.get('sidebarRight')`, when available.
 * @param sessionId - durable Session id.
 * @param absolutePath - the file's absolute path.
 * @returns whether `openResource` was called.
 */
export function openInDsh(
  sidebar: unknown,
  sessionId: string | null | undefined,
  absolutePath: string | null | undefined,
): boolean {
  if (sidebar === undefined || sidebar === null) return false
  if (typeof (sidebar as Partial<SidebarService>).openResource !== 'function') return false
  if (typeof sessionId !== 'string' || sessionId === '') return false
  if (typeof absolutePath !== 'string' || absolutePath === '') return false
  try {
    ;(sidebar as SidebarService).openResource(sessionFileAddress(sessionId, absolutePath))
  } catch {
    // The service throws when no Session surface is mounted; the caller owns
    // the visible error line, so the helper keeps its boolean contract.
    return false
  }
  return true
}
