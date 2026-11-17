/**
 * Host-side smoke check for the dsh-wiki row.
 *
 * `bun test` covers the pure logic; this covers assembly against the installed
 * DSH — `loadShipped` resolves the tool registry, `defineTool` accepts the
 * schema, the prompt section and `/wiki` route register, and one tool action
 * plus one HTTP read both answer.
 *
 *   ELECTRON_RUN_AS_NODE=1 "$DSH_NODE_EXECUTABLE" scripts/smoke-wiki.mjs
 *
 * @module dsh-hyper-mode-workspace/scripts/smoke-wiki
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const home = mkdtempSync(join(tmpdir(), 'dsh-wiki-smoke-'))
const project = join(home, 'project')
const tools = []
const sections = []
const routes = []
const skills = []

const services = {
  profileContext: process.env.DSH_INSTALL_DIR === undefined
    ? undefined
    : { installAnchor: join(process.env.DSH_INSTALL_DIR, 'package.json') },
  workingDirectory: { get: () => project },
  subagents: { namesOf: () => ({ self: 'lead' }) },
  systemPrompt: { section: (section) => { sections.push(section); return () => {} } },
  webServer: { register: (route) => { routes.push(route); return () => {} } },
  skills: { register: (skill) => { skills.push(skill); return () => {} } },
}

const host = {
  effect: (factory) => {
    const dispose = factory()
    return () => dispose?.()
  },
  get: (name) => (name === 'connection' ? undefined : services[name]),
  logger: { info: (line) => console.log('[host]', line), debug: () => {}, warn: (line) => console.warn('[host:warn]', line) },
  tools: { register: (definition) => { tools.push(definition); return () => {} } },
  inject: (deps, callback) => callback({ effect: host.effect, get: host.get }),
}

const { apply } = await import('../packages/hyper-wiki/lib/index.js')
apply(host, { home, git: false })

console.log('tools:', tools.map((tool) => tool.name).join(', '))
console.log('sections:', sections.map((section) => section.name).join(', '))
console.log('routes:', routes.map((route) => `${route.kind}:${route.path}`).join(', '))
console.log('skills:', skills.map((skill) => skill.name).join(', '))

if (tools.length !== 1 || tools[0].name !== 'wiki') throw new Error('wiki tool missing')
if (routes.length !== 1) throw new Error(`expected one route, got ${routes.length}`)

const result = await tools[0].execute({ action: 'list' }, { signal: new AbortController().signal })
console.log('tool list:', JSON.stringify(result).slice(0, 200))
if (result?.ok !== true) throw new Error('wiki list action failed')

const response = {
  statusCode: 0,
  text: '',
  headers: {},
  setHeader(name, value) { this.headers[name] = value },
  end(text) { this.text = text ?? '' },
}
await routes[0].handler(
  {
    method: 'GET',
    url: `/wiki/state?cwd=${encodeURIComponent(project)}`,
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
  },
  response,
)
console.log('state:', response.statusCode, String(response.text).slice(0, 240))
if (response.statusCode !== 200) throw new Error('wiki state route failed')

rmSync(home, { recursive: true, force: true })
console.log('SMOKE OK')
