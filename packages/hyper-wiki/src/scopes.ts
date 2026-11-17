/**
 * Wiki scopes: where a store lives on disk.
 *
 * Two scopes exist and stay completely independent — the same page id in both
 * resolves to two different files:
 *
 * - **global** — `$DSH_HOME/wiki/` (default `~/.dsh/wiki/`), with the contract
 *   file `$DSH_HOME/wiki.md`. Only this scope is a git repository.
 * - **project** — `<projectRoot>/.dsh/wiki/`, contract `<projectRoot>/.dsh/wiki.md`,
 *   where `projectRoot` is the nearest ancestor of the session directory that
 *   contains `.git`.
 *
 * The panel has no session, so it reaches a project scope through a recent
 * project list kept in `$DSH_HOME/wiki/state.json` plus an explicit `cwd`.
 *
 * @module @chrock-studio/dsh-hyper-wiki/scopes
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import type { Dirent } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, resolve } from 'node:path'

/** How many recent projects the panel list keeps. */
export const DEFAULT_RECENT_LIMIT = 8

/** File holding panel navigation state inside the global wiki directory. */
const STATE_FILE = 'state.json'

/** Directories inside a wiki root that never hold pages. */
const BOOKKEEPING = new Set(['drafts', '.trash'])

/** How deep the presence probe looks for a first page. */
const PRESENCE_DEPTH = 4

/** Which store a descriptor names. */
export type ScopeKind = 'global' | 'project'

/** One scope's paths, as the store and the routes consume them. */
export interface WikiScope {
  scope: ScopeKind
  root: string
  base: string
  wikiDir: string
  contractFile: string
  git: boolean
}

/** Options `describeScope` accepts. */
export interface DescribeScopeOptions {
  /** Flip the project layout (`<root>/.dsh`) on. */
  project?: boolean
}

/** Options `createScopes` accepts. */
export interface ScopesOptions {
  /** Absolute DSH home override. */
  home?: string
  /** Override for `state.json`, used by tests. */
  statePath?: string
  /** Recent-project ceiling. */
  recentLimit?: number
}

/**
 * Whether a directory tree holds at least one page file.
 *
 * The probe stops at the first page, so a populated wiki costs one readdir.
 * @param dir - directory to inspect.
 * @param depth - remaining depth budget.
 * @returns the presence flag.
 */
function containsPage(dir: string, depth = PRESENCE_DEPTH): boolean {
  if (depth < 0) return false
  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return false
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    if (entry.isFile()) {
      if (entry.name.endsWith('.md')) return true
      continue
    }
    if (!entry.isDirectory() || BOOKKEEPING.has(entry.name)) continue
    if (containsPage(`${dir}/${entry.name}`, depth - 1)) return true
  }
  return false
}

/**
 * The DSH home directory.
 * @param env - environment source; `DSH_HOME` wins when it is absolute.
 * @returns an absolute home path.
 */
export function resolveHome(env: { DSH_HOME?: string | undefined } = process.env): string {
  const configured = env?.DSH_HOME
  if (typeof configured === 'string' && configured !== '' && isAbsolute(configured)) return configured
  return join(homedir(), '.dsh')
}

/**
 * Find the project root for a session directory.
 * @param start - absolute or relative directory.
 * @returns the nearest ancestor (including `start`) containing `.git`, or the
 *   resolved `start` when there is none.
 */
export function findProjectRoot(start: unknown): string {
  const origin = resolve(String(start ?? '.'))
  let dir = origin
  while (true) {
    if (existsSync(join(dir, '.git'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return origin
    dir = parent
  }
}

/**
 * Describe one scope's paths.
 * @param kind - `global` or `project`.
 * @param root - the directory the wiki hangs off: the DSH home for a global
 *   scope, the project root for a project scope.
 * @param options - `project` flips the project layout on.
 * @returns the scope descriptor used by the store and the routes.
 */
export function describeScope(
  kind: ScopeKind,
  root: string,
  options: DescribeScopeOptions = {},
): WikiScope {
  const base = options.project === true ? join(root, '.dsh') : root
  return {
    scope: kind,
    root,
    base,
    wikiDir: join(base, 'wiki'),
    contractFile: join(base, 'wiki.md'),
    git: options.project !== true,
  }
}

/**
 * Build the scope index for one process.
 * @param options - `home` (defaults to `$DSH_HOME`), `statePath`, and the
 *   recent-project ceiling.
 * @returns scope resolution, presence checks, and recent-project bookkeeping.
 */
export function createScopes(options: ScopesOptions = {}) {
  const home = options.home ?? resolveHome()
  const statePath = options.statePath ?? join(home, 'wiki', STATE_FILE)
  const recentLimit = Number.isFinite(options.recentLimit) && (options.recentLimit ?? 0) > 0
    ? Math.floor(options.recentLimit ?? DEFAULT_RECENT_LIMIT)
    : DEFAULT_RECENT_LIMIT
  let cache: string[] | undefined

  /** The global scope descriptor. */
  const global = (): WikiScope => describeScope('global', home)

  /**
   * The project scope for a directory.
   * @param cwd - session or panel-supplied directory.
   * @returns the descriptor, or undefined without a directory.
   */
  const project = (cwd: unknown): WikiScope | undefined => {
    if (typeof cwd !== 'string' || cwd.trim() === '') return undefined
    return describeScope('project', findProjectRoot(cwd), { project: true })
  }

  /**
   * The scope a name addresses.
   * @param name - `global`, `project`, or undefined for the caller's default.
   * @param cwd - directory used to resolve a project scope.
   * @returns the descriptor, or undefined when the name cannot be resolved.
   */
  const resolveScope = (name: unknown, cwd: unknown): WikiScope | undefined => {
    if (name === 'global') return global()
    if (name === 'project') return project(cwd)
    return undefined
  }

  /**
   * Both scopes, in display order.
   * @param cwd - directory used to resolve the project scope.
   * @returns the global scope and, when a directory is known, the project one.
   */
  const listScopes = (cwd: unknown): WikiScope[] => {
    const projectScope = project(cwd)
    return projectScope === undefined ? [global()] : [global(), projectScope]
  }

  /**
   * Whether a scope holds a wiki: either the human-maintained contract file or
   * at least one page exists. A bare `wiki/` directory (which the panel's
   * `state.json` alone can create) is not a wiki.
   * @param scope - scope descriptor.
   * @returns the presence flag.
   */
  const hasWiki = (scope: WikiScope): boolean => existsSync(scope.contractFile) || containsPage(scope.wikiDir)

  /**
   * Read the panel's recent-project list.
   * @returns absolute project roots, most recent first.
   */
  const readRecent = (): string[] => {
    if (cache !== undefined) return cache
    cache = []
    try {
      // The state file is ours and shallow: one array of strings. The cast is
      // the seam where untyped JSON becomes readable values.
      const parsed = JSON.parse(readFileSync(statePath, 'utf8')) as Record<string, unknown> | null
      const rows = Array.isArray(parsed?.recentProjects) ? parsed.recentProjects : []
      for (const row of rows) {
        if (typeof row === 'string' && isAbsolute(row) && !cache.includes(row) && cache.length < recentLimit) {
          cache.push(row)
        }
      }
    } catch {
      // A missing or malformed state file is an empty list, never an error.
    }
    return cache
  }

  /**
   * Record that a project scope was used. Writes only when the order changes,
   * so a tool called repeatedly in one session does not rewrite the file.
   * @param projectRoot - absolute project root.
   * @returns whether the list changed.
   */
  const noteRecent = (projectRoot: unknown): boolean => {
    if (typeof projectRoot !== 'string' || !isAbsolute(projectRoot)) return false
    const current = readRecent()
    if (current[0] === projectRoot) return false
    const next = [projectRoot, ...current.filter(row => row !== projectRoot)].slice(0, recentLimit)
    cache = next
    try {
      mkdirSync(dirname(statePath), { recursive: true })
      writeFileSync(statePath, `${JSON.stringify({ version: 1, recentProjects: next }, null, 2)}\n`, 'utf8')
      return true
    } catch {
      // A read-only home must not break a wiki call; the in-memory list still works.
      return false
    }
  }

  return {
    home,
    statePath,
    recentLimit,
    global,
    project,
    resolveScope,
    listScopes,
    hasWiki,
    readRecent,
    noteRecent,
  }
}

/** The scope index one plugin instance shares. */
export type ScopeIndex = ReturnType<typeof createScopes>

/**
 * Write a file atomically: a sibling temporary file then a rename.
 * @param file - destination path.
 * @param text - UTF-8 contents.
 */
export function writeFileAtomic(file: string, text: string): void {
  mkdirSync(dirname(file), { recursive: true })
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(temporary, text, 'utf8')
  renameSync(temporary, file)
}
