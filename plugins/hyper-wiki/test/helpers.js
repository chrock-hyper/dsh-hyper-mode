/**
 * Shared test fixtures: temporary homes, a project tree, and fake HTTP pairs.
 *
 * Nothing here touches the network or the real `~/.dsh`; every path comes from
 * `mkdtempSync`.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'

import { createGit } from '../lib/git.js'
import { createScopes } from '../lib/scopes.js'
import { createWikiStore } from '../lib/store.js'

/** Every temporary tree this run created, removed when the test process exits. */
const temporaryTrees = []

process.on('exit', () => {
  for (const dir of temporaryTrees) {
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      // A leftover temp tree must never fail the run.
    }
  }
})

/**
 * Track one temporary tree for exit-time removal.
 * @param dir - directory created by `mkdtempSync`.
 * @returns the same path.
 */
function track(dir) {
  temporaryTrees.push(dir)
  return dir
}

/** A logger that records instead of printing. */
export function quietLogger() {
  const rows = []
  return {
    rows,
    warn: message => rows.push(['warn', message]),
    debug: message => rows.push(['debug', message]),
  }
}

/**
 * Build one isolated environment.
 * @param options - `gitBin`, `now`, and whether the project exists.
 * @returns the home, project root, scope index, git helper, store, and cleanup.
 */
export function makeEnv(options = {}) {
  const home = mkdtempSync(join(tmpdir(), 'dsh-wiki-home-'))
  // The project root carries `.git`; `workspace` is a nested session directory,
  // so scope resolution is exercised the way a real session reaches it.
  const project = mkdtempSync(join(tmpdir(), 'dsh-wiki-project-'))
  const workspace = join(project, 'workspace')
  mkdirSync(join(project, '.git'), { recursive: true })
  mkdirSync(workspace, { recursive: true })
  const logger = options.logger ?? quietLogger()
  const scopes = createScopes({ home, recentLimit: 5 })
  const git = createGit({
    bin: options.gitBin ?? 'git',
    enabled: options.git !== false,
    logger,
  })
  const core = createWikiStore({
    scopes,
    git,
    logger,
    maxResults: options.maxResults ?? 20,
    now: options.now,
  })
  return { home, project, workspace, scopes, git, core, logger }
}

/**
 * Write one file, creating its directory.
 * @param file - absolute path.
 * @param text - contents.
 */
export function write(file, text) {
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, text, 'utf8')
}

/**
 * A fake inbound request.
 * @param options - `method`, `url`, `headers`, `body`, `remoteAddress`.
 * @returns a readable stream carrying the node request fields the router reads.
 */
export function fakeRequest(options = {}) {
  const body = options.body
  const chunks = body === undefined
    ? []
    : [Buffer.from(typeof body === 'string' ? body : JSON.stringify(body), 'utf8')]
  const req = Readable.from(chunks)
  req.method = options.method ?? 'GET'
  req.url = options.url ?? '/wiki/state'
  req.headers = options.headers ?? {}
  req.socket = { remoteAddress: options.remoteAddress ?? '127.0.0.1' }
  return req
}

/**
 * A fake server response that records what the handler wrote.
 * @returns the response object, with `body` and `headers` after `end`.
 */
export function fakeResponse() {
  const headers = {}
  const res = {
    statusCode: 200,
    headersSent: false,
    body: undefined,
    finished: false,
    headers,
    setHeader(name, value) {
      headers[String(name).toLowerCase()] = value
    },
    getHeader(name) {
      return headers[String(name).toLowerCase()]
    },
    end(text) {
      res.body = text === undefined ? '' : String(text)
      res.headersSent = true
      res.finished = true
    },
  }
  return res
}

/**
 * Call a handler once and return its parsed body.
 * @param handler - node handler.
 * @param options - request options.
 * @returns `{ status, headers, json, text }`.
 */
export async function call(handler, options = {}) {
  const req = fakeRequest(options)
  const res = fakeResponse()
  await handler(req, res)
  let json
  try {
    json = res.body === '' ? undefined : JSON.parse(res.body)
  } catch {
    json = undefined
  }
  return { status: res.statusCode, headers: res.headers, json, text: res.body }
}

/**
 * Resolve a temp directory through its real path (macOS /var symlink).
 * @param path - a mkdtemp path.
 * @returns the real path.
 */
export function real(path) {
  return realpathSync(path)
}
