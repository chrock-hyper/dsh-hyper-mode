/**
 * Catalog rendering and cross-role note search for the role tools.
 *
 * Everything here is a read projection over the role store: the text a caller
 * sees for `role action=list`, the `role action=notes` hits, and the roster
 * section the system prompt embeds.
 *
 * @module @chrock-hyper/dsh-hyper-roles/tools/catalog
 */
import type { RenderRosterOptions, RosterRow } from '../marker.ts'
import { clip, renderRoster } from '../marker.ts'
import type { ResolvedDirs } from '../scopes.ts'
import { listBuiltins, listRoles, readNotes } from '../store.ts'
import type { RoleListRow } from '../store/list.ts'

/** One experience entry found by a keyword, carrying the role it belongs to. */
export interface NoteHit {
  role: string
  at: string
  source: string
  text: string
}

/**
 * Render every visible role for `action=list` and unbound briefs.
 * @param dirs - scope directories.
 * @param packageRoot - absolute bundle package root, for the shipped catalog.
 * @returns the catalog text.
 */
export function catalogText(dirs: ResolvedDirs, packageRoot: string): string {
  const listed = listRoles(dirs)
  const lines: string[] = []
  if (listed.problems.length > 0) {
    lines.push(`有 ${listed.problems.length} 个岗位文件无法解析（用文件路径直接查看）：`)
    for (const problem of listed.problems) lines.push(`- ${problem.path} — ${problem.message}`)
    lines.push('')
  }
  const section = (label: string, rows: RoleListRow[]): void => {
    if (rows.length === 0) return
    lines.push(`${label}：`)
    for (const row of rows) {
      const flags = [row.shadowed === true ? '覆盖全局' : '', `v${row.version}`].filter((entry) => entry !== '').join('，')
      const hint = typeof row.summary === 'string' && row.summary !== '' ? ` — ${clip(row.summary, 100)}` : ''
      lines.push(`- ${row.id} · ${row.title}（${flags}）${hint}`)
    }
    lines.push('')
  }
  section('项目作用域', listed.project)
  section('全局作用域', listed.global)
  const builtins = listBuiltins(packageRoot)
  if (builtins.length > 0) {
    lines.push('随包岗位（只读；在面板里复制到某个作用域后即可编辑）：')
    for (const row of builtins) lines.push(`- ${row.id} · ${row.title}`)
    lines.push('')
  }
  if (lines.length === 0) return '当前没有任何岗位。用 `role_edit` 的 action=create 新建一个。'
  return `${lines.join('\n').trimEnd()}\n\n用 \`role\` 读取某个岗位的职责与经验；委派用 \`role_spawn\`。`
}

/**
 * Find experience entries across every visible role.
 * @param dirs - scope directories.
 * @param needle - lowercased keyword.
 * @returns matches newest first, each carrying its role id.
 */
export function searchNotes(dirs: ResolvedDirs, needle: string): NoteHit[] {
  const listed = listRoles(dirs)
  const hits: NoteHit[] = []
  for (const row of [...listed.project, ...listed.global]) {
    for (const entry of readNotes(dirs, row.id).entries) {
      if (!entry.text.toLowerCase().includes(needle)) continue
      hits.push({ role: row.id, at: entry.at, source: entry.source, text: entry.text })
    }
  }
  return hits.sort((left, right) => String(right.at).localeCompare(String(left.at)))
}

/**
 * Render the roster section used by the system prompt.
 * @param dirs - scope directories.
 * @param options - max entries.
 * @returns the section text.
 */
export function rosterText(dirs: ResolvedDirs, options: RenderRosterOptions = {}): string {
  const listed = listRoles(dirs)
  const rows: RosterRow[] = [...listed.project, ...listed.global].map((row) => ({
    id: row.id,
    title: row.title,
    scope: row.scope,
    summary: row.summary,
  }))
  return renderRoster(rows, options)
}
