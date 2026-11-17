/**
 * Host-side smoke check for the hyper-roles row.
 *
 * `bun test` covers the pure logic; this script covers the one thing unit tests
 * cannot: that the plugin actually assembles against a real DSH — the shipped
 * tool registry resolves, `defineTool` accepts every schema, the prompt sections
 * register, and the panel route answers.
 *
 * Run it with the Host's own runtime, never a `node` from PATH:
 *
 *   ELECTRON_RUN_AS_NODE=1 "$DSH_NODE_EXECUTABLE" scripts/smoke-roles.mjs
 *
 * @module dsh-hyper-mode-workspace/scripts/smoke-roles
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const home = mkdtempSync(join(tmpdir(), 'hyper-roles-smoke-'))
const project = join(home, 'project')
const tools = []
const sections = []
const routes = []

const host = {
  effect: (factory) => {
    const dispose = factory()
    return () => dispose?.()
  },
  get: (name) => {
    if (name === 'profileContext') {
      return process.env.DSH_INSTALL_DIR === undefined ? undefined : { installAnchor: join(process.env.DSH_INSTALL_DIR, 'package.json') }
    }
    if (name === 'workingDirectory') return { get: () => project }
    return undefined
  },
  logger: { info: (line) => console.log('[host]', line), warn: (line) => console.warn('[host:warn]', line) },
  tools: { register: (definition) => { tools.push(definition); return () => {} } },
  systemPrompt: { section: (section) => { sections.push(section); return () => {} } },
  inject: (deps, callback) => {
    if (!deps.includes('webServer')) return
    callback({
      effect: (factory) => factory(),
      get: (name) => (name === 'connection' ? { requestRejection: () => undefined } : undefined),
      webServer: { register: (route) => { routes.push(route); return () => {} } },
    })
  },
}

process.env.DSH_HOME = home
const { apply } = await import('../packages/hyper-roles/lib/index.js')
await apply(host)

console.log('tools:', tools.map((tool) => tool.name).join(', '))
console.log('sections:', sections.map((section) => `${section.name}@${section.order}`).join(', '))
console.log('routes:', routes.map((route) => route.path).join(', '))

if (tools.length !== 3) throw new Error(`expected 3 tools, got ${tools.length}`)
if (sections.length !== 2) throw new Error(`expected 2 prompt sections, got ${sections.length}`)
if (routes.length !== 1) throw new Error(`expected 1 route, got ${routes.length}`)

const route = routes[0]
const body = JSON.stringify({ id: 'smoke', title: '冒烟岗位', body: '## 职责\n冒烟。' })
const created = { status: 0, text: '', writeHead(status) { this.status = status }, end(text) { this.text = text ?? '' } }
await route.handler(
  {
    method: 'POST',
    url: `/hyper-roles/api/role/project?cwd=${encodeURIComponent(project)}`,
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() { yield Buffer.from(body) },
  },
  created,
)
console.log('create:', created.status, created.text)
if (created.status !== 200) throw new Error('create failed')

const listed = { status: 0, text: '', writeHead(status) { this.status = status }, end(text) { this.text = text ?? '' } }
await route.handler(
  {
    method: 'GET',
    url: `/hyper-roles/api/state?cwd=${encodeURIComponent(project)}`,
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
  },
  listed,
)
const state = JSON.parse(listed.text)
console.log('state roles(project):', state.roles.project.map((row) => `${row.id}@v${row.version}`).join(', '))

const selfSection = sections.find((section) => section.name === 'hyper-roles:self')
const roster = sections.find((section) => section.name === 'hyper-roles:roster')
console.log('roster preview:', String(roster.text({})).split('\n').slice(0, 3).join(' | '))
console.log('self on unbound agent:', JSON.stringify(selfSection.text({ agent: { session: {} } })))

rmSync(home, { recursive: true, force: true })
console.log('SMOKE OK')
