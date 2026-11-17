/**
 * Optional git history for the global wiki.
 *
 * The global store is its own repository: the first mutation initializes it,
 * and every approval, rejection-free change, delete, and rename commits. The
 * project store never runs git — a project already has its own repository and
 * the wiki does not get to decide what belongs in it.
 *
 * A missing `git` binary, a failed command, or an unwritable directory
 * degrades to "no history": the mutation itself must still succeed.
 *
 * @module @chrock-hyper/dsh-hyper-wiki/git
 */
import { existsSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

import type { HostLogger } from '@chrock-hyper/dsh-hyper-shared/host'

/** Default executable name; a Config value may point elsewhere. */
export const DEFAULT_GIT_BIN = 'git'

/** Entries kept out of the history: panel navigation state and trashed pages. */
const GITIGNORE = ['state.json', '.trash/', '*.tmp-*', ''].join('\n')

/** Per-command deadline; a hung git must not hang a wiki mutation. */
const GIT_TIMEOUT_MS = 15_000

/** Identity used for wiki commits when the machine has none configured. */
const IDENTITY = [
  '-c', 'user.name=dsh-wiki',
  '-c', 'user.email=dsh-wiki@localhost',
]

/** What one git invocation reported. */
export interface GitRunResult {
  status: number | null
  stdout: string
  stderr: string
  error: Error | undefined
}

/** What one commit attempt reported; a failure carries a reason, never a throw. */
export interface GitCommitResult {
  committed: boolean
  reason?: string
  message?: string
}

/** Options `createGit` accepts. */
export interface GitOptions {
  bin?: unknown
  enabled?: unknown
  logger?: unknown
}

/**
 * Run one git command.
 * @param bin - executable.
 * @param args - arguments.
 * @param cwd - working directory.
 * @returns `{ status, stdout, stderr }`, with `status` null on spawn failure.
 */
function run(bin: string, args: string[], cwd: string): GitRunResult {
  try {
    const result = spawnSync(bin, args, {
      cwd,
      encoding: 'utf8',
      timeout: GIT_TIMEOUT_MS,
      windowsHide: true,
    })
    return {
      status: result.status,
      stdout: typeof result.stdout === 'string' ? result.stdout : '',
      stderr: typeof result.stderr === 'string' ? result.stderr : '',
      error: result.error,
    }
  } catch (error) {
    // spawnSync only throws on invalid arguments, which is always an Error.
    return { status: null, stdout: '', stderr: '', error: error as Error }
  }
}

/**
 * Build the git helper for one plugin instance.
 * @param options - `bin`, `enabled`, and a logger.
 * @returns `available`, `ensure`, and `commit`, each failure-tolerant.
 */
export function createGit(options: GitOptions = {}) {
  const bin = typeof options.bin === 'string' && options.bin !== '' ? options.bin : DEFAULT_GIT_BIN
  const enabled = options.enabled !== false
  const log: HostLogger =
    typeof options.logger === 'object' && options.logger !== null ? (options.logger as HostLogger) : {}
  let available: boolean | undefined

  /**
   * Whether the executable answers at all.
   * @returns the cached availability flag.
   */
  const isAvailable = (): boolean => {
    if (available !== undefined) return available
    if (!enabled) {
      available = false
      return available
    }
    const result = run(bin, ['--version'], process.cwd())
    available = result.status === 0
    if (!available) log.debug?.(`dsh-wiki: git unavailable (${bin}); history disabled`)
    return available
  }

  /**
   * Ensure the directory is a repository.
   * @param dir - the wiki directory.
   * @returns whether the directory is a repository after the call.
   */
  const ensure = (dir: string): boolean => {
    if (!isAvailable()) return false
    if (existsSync(join(dir, '.git'))) return true
    const init = run(bin, ['init', '--quiet'], dir)
    if (init.status !== 0) {
      log.warn?.(`dsh-wiki: git init failed in ${dir}: ${(init.stderr || init.error?.message || '').trim()}`)
      return false
    }
    try {
      writeFileSync(join(dir, '.gitignore'), GITIGNORE, 'utf8')
    } catch (error) {
      log.debug?.(`dsh-wiki: could not write .gitignore: ${String((error as { message?: unknown } | null)?.message ?? error)}`)
    }
    return true
  }

  /**
   * Commit whatever changed in the repository.
   * @param dir - the wiki directory.
   * @param message - commit subject.
   * @returns the outcome; `committed: false` carries a reason instead of
   *   throwing.
   */
  const commit = (dir: string, message: string): GitCommitResult => {
    if (!ensure(dir)) return { committed: false, reason: 'git unavailable' }
    const added = run(bin, ['add', '-A'], dir)
    if (added.status !== 0) {
      log.warn?.(`dsh-wiki: git add failed in ${dir}: ${(added.stderr || '').trim()}`)
      return { committed: false, reason: 'git add failed' }
    }
    const status = run(bin, ['status', '--porcelain'], dir)
    if (status.status !== 0) {
      log.warn?.(`dsh-wiki: git status failed in ${dir}: ${(status.stderr || '').trim()}`)
      return { committed: false, reason: 'git status failed' }
    }
    if (status.stdout.trim() === '') return { committed: false, reason: 'no changes' }
    const committed = run(bin, [...IDENTITY, 'commit', '--quiet', '-m', message], dir)
    if (committed.status !== 0) {
      log.warn?.(`dsh-wiki: git commit failed in ${dir}: ${(committed.stderr || '').trim()}`)
      return { committed: false, reason: 'git commit failed' }
    }
    return { committed: true, message }
  }

  return { bin, enabled, available: isAvailable, ensure, commit }
}

/** The git helper one plugin instance shares. */
export type GitHelper = ReturnType<typeof createGit>
