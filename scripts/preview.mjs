/**
 * Render a real client component without the app: load the browser module with
 * a React shim, feed it fixture API responses, serialize the tree, and write a
 * page that reproduces the conversation view container (`flex` column, the
 * same one `conversation.view` uses). This is how the panel gets looked at
 * before it reaches the running app.
 *
 *   bun scripts/preview.mjs roles
 *   bun scripts/preview.mjs wiki
 *   bun scripts/preview.mjs orders
 *
 * The orders page mounts the panel four times — normal, empty, error and no
 * project root — and `?panel=empty|error|noproject` switches between them, so a
 * headless screenshot can look at each state without the app.
 *
 * @module @chrock-studio/dsh-hyper-mode/scripts/preview
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const requested = process.argv[2]
const kind = requested === 'wiki' ? 'wiki' : requested === 'orders' ? 'orders' : 'roles'
const clientFile = kind === 'roles'
  ? join(root, 'plugins/hyper-roles/client/client.js')
  : kind === 'wiki'
    ? join(root, 'plugins/hyper-wiki/client/client.js')
    : join(root, 'plugins/hyper-org/client/client.js')
const source = readFileSync(clientFile, 'utf8')
const styles = /const STYLES = `([\s\S]*?)`\n/.exec(source)?.[1] ?? ''
if (styles === '') throw new Error('no STYLES block found')

// ------------------------------------------------------------------ React shim
const sameDeps = (left, right) => Array.isArray(left) && Array.isArray(right)
  && left.length === right.length && left.every((value, index) => Object.is(value, right[index]))

function createHooks() {
  const cells = []
  let cursor = 0
  let dirty = false
  let effects = []
  return {
    begin() { cursor = 0; effects = [] },
    pending() { return effects.length > 0 || dirty },
    clearDirty() { dirty = false },
    take() { return effects },
    useState(initial) {
      const index = cursor++
      if (!cells[index] || !('state' in cells[index])) cells[index] = { state: typeof initial === 'function' ? initial() : initial }
      const cell = cells[index]
      const set = (next) => {
        const value = typeof next === 'function' ? next(cell.state) : next
        if (!Object.is(value, cell.state)) { cell.state = value; dirty = true }
      }
      return [cell.state, set]
    },
    useRef(initial) {
      const index = cursor++
      if (!cells[index]) cells[index] = { ref: { current: initial } }
      return cells[index].ref
    },
    useMemo(factory, deps) {
      const index = cursor++
      if (!cells[index] || !sameDeps(cells[index].deps, deps)) cells[index] = { deps, value: factory() }
      return cells[index].value
    },
    useCallback(factory, deps) {
      const index = cursor++
      if (!cells[index] || !sameDeps(cells[index].deps, deps)) cells[index] = { deps, value: factory }
      return cells[index].value
    },
    useEffect(effect, deps) {
      const index = cursor++
      if (!cells[index] || !sameDeps(cells[index].deps, deps)) {
        cells[index] = { deps }
        effects.push(effect)
      }
    },
  }
}

/** @param hooks - the hook runtime. @returns the React stand-in the module destructures. */
const FRAGMENT = Symbol('Fragment')

/** @param hooks - the hook runtime. @returns the React stand-in the module destructures. */
function createReact(hooks) {
  const Fragment = FRAGMENT
  return {
    Fragment,
    createElement(type, props, ...children) {
      return { type, props: props ?? {}, children: children.flat(Infinity).filter((child) => child !== null && child !== false) }
    },
    useState: hooks.useState,
    useRef: hooks.useRef,
    useMemo: hooks.useMemo,
    useCallback: hooks.useCallback,
    useEffect: hooks.useEffect,
  }
}

// -------------------------------------------------------------------- fixtures
const rolesState = {
  ok: true,
  home: '/Users/you/.dsh',
  projectRoot: '/Users/you/src/app',
  globalDir: '/Users/you/.dsh/roles',
  projectDir: '/Users/you/src/app/.dsh/roles',
  recentProjects: [],
  problems: [],
  builtins: [{ id: 'trainer', title: '培训员' }],
  roles: {
    project: [
      { id: 'reviewer', title: '代码评审员', version: 3, shadowed: false, capabilities: ['静态分析'] },
      { id: 'implementer', title: '实现者', version: 2, shadowed: false, capabilities: [] },
    ],
    global: [
      { id: 'architect', title: '架构师', version: 5, shadowed: true, capabilities: [] },
    ],
  },
}
const roleDoc = {
  ok: true,
  scope: 'project',
  path: '/Users/you/src/app/.dsh/roles/reviewer.md',
  revision: 3,
  fields: {
    id: 'reviewer',
    title: '代码评审员',
    version: 3,
    capabilities: ['静态分析', '风险识别', '回归验证'],
    skills: ['dsh-bundle-authoring'],
    handoffs: ['implementer', 'architect'],
    can: ['edit-roles'],
  },
  body: '## 职责\n对变更做风险分级，给出可执行的修复清单；不替作者改代码，只指出「哪里会坏、为什么、怎么验证」。\n\n## 工作方式\n先看测试再看实现；diff 超过 400 行先要求拆 PR；每个结论都要能指到具体行。\n\n## 交互对象\n向上：architect（设计约束）；向下：implementer（修复清单）。\n\n## 完成标准\n每条风险都有触发条件、后果与验证方式。',
  guide: '阅读顺序：先读 wiki 的《评审约定》→ 再看《错误码规范》→ 最后看 ADR-0007。\n- guide/error-codes.md\n- adr/0007-role-orchestration.md',
  notes: [
    { at: '2026-11-15T02:40:00.000Z', source: 'lead', text: 'diff 超过 400 行才要求拆 PR，否则是噪声。' },
    { at: '2026-11-14T21:12:00.000Z', source: 'reviewer', text: '先看测试再看实现：测试表达了作者的意图，实现只是手段。' },
    { at: '2026-11-13T18:03:00.000Z', source: 'trainer', text: '跨岗位经验：架构师的「爆炸半径」可以直接用作评审第一条判据。' },
  ],
}

const wikiState = {
  ok: true,
  scopes: [
    { scope: 'global', root: '/Users/you/.dsh', wikiDir: '/Users/you/.dsh/wiki', contract: '/Users/you/.dsh/wiki.md', git: true, exists: true, pages: 2, pending: 0 },
    { scope: 'project', root: '/Users/you/src/app', wikiDir: '/Users/you/src/app/.dsh/wiki', contract: '/Users/you/src/app/.dsh/wiki.md', git: false, exists: true, pages: 4, pending: 1 },
  ],
  recentProjects: [],
}
const wikiPages = [
  { path: 'guide/error-codes.md', title: '错误码规范', tags: ['约定', 'api'], status: 'stable', updated: '2026-11-12', hasDraft: true },
  { path: 'guide/onboarding.md', title: '新人上手', tags: ['流程'], status: 'wip', updated: '2026-11-08', hasDraft: false },
  { path: 'adr/0007-role-orchestration.md', title: 'ADR-0007 岗位制编排', tags: ['adr'], status: 'wip', updated: '2026-11-15', hasDraft: false },
  { path: 'domain/glossary.md', title: '术语表', tags: ['术语'], status: 'stable', updated: '2026-11-02', hasDraft: false },
]
const wikiPage = {
  ok: true,
  scope: 'project',
  path: 'guide/error-codes.md',
  title: '错误码规范',
  tags: ['约定', 'api'],
  status: 'stable',
  updated: '2026-11-12',
  body: '## 原则\n错误码是接口的一部分，一旦发布就只能新增，不能改语义。\n\n## 命名\n`<域>.<对象>.<原因>`，例如 `auth.token.expired`。\n\n## 记录\n每个码必须在错误码表里有一行：含义、触发条件、客户端动作。',
  text: '---\ntitle: 错误码规范\ntags: [约定, api]\nstatus: stable\nupdated: 2026-11-12\n---\n\n## 原则\n错误码是接口的一部分，一旦发布就只能新增，不能改语义。',
  backlinks: [
    { path: 'guide/onboarding.md', title: '新人上手' },
    { path: 'adr/0007-role-orchestration.md', title: 'ADR-0007 岗位制编排' },
  ],
  draft: {
    status: 'pending',
    author: 'lead',
    base: '3f2a91c4',
    updated: '2026-11-15T02:40:00.000Z',
    text: 'title: 错误码规范\n---\n\n## 原则\n错误码是接口的一部分，一旦发布就只能新增，不能改语义；**废弃要走弃用流程**。',
    diff: ' 错误码是接口的一部分，一旦发布就只能新增，不能改语义。\n+**废弃要走弃用流程**：先标记 deprecated，下一个大版本再删除。\n 每个码必须在错误码表里有一行：含义、触发条件、客户端动作。\n+负责人。',
  },
}

// ------------------------------------------------------------------ orders fixture
// Mirrors the real `/hyper-org/api` payloads: five stage columns, a folded
// dropped strip, an aging review card and one order whose log is long enough to
// exercise the >100 fold. `absolutePath` is what the panel turns into a
// `dsh-resource://` address; nothing in this preview reads a file.
const orderRows = [
  {
    id: 'wo-20261116-1',
    title: '工单看板改版：五列 Kanban + 固定检查器，交付物都在最右侧 DSH 文档预览里打开（长标题示例：这段要能截断到两行，悬停时看到全文）',
    stage: 'review', size: 'M', dri: 'engineer', driTitle: '工程师', scope: 'project', age: '5 天',
    updatedAt: '2026-11-12T07:00:00.000Z', acceptanceCount: 5, artifactCount: 2, logCount: 120, occupiesSlot: true,
  },
  {
    id: 'wo-20261115-2', title: '在制那单：规则下沉到 lib/rules.js', stage: 'active', size: 'M',
    dri: 'engineer', driTitle: '工程师', scope: 'project', age: '2 天',
    updatedAt: '2026-11-15T09:00:00.000Z', acceptanceCount: 6, artifactCount: 1, logCount: 3, occupiesSlot: true,
  },
  {
    id: 'wo-20261114-4', title: '排队那单：在制满时落 intake', stage: 'intake', size: 'L',
    dri: null, driTitle: null, scope: 'global', age: '6 天',
    updatedAt: '2026-11-11T08:00:00.000Z', acceptanceCount: 0, artifactCount: 0, logCount: 1, occupiesSlot: false,
  },
  {
    id: 'wo-20261117-2', title: '受阻那单：等外部接口权限', stage: 'blocked', size: 'M',
    dri: 'architect', driTitle: '架构师', scope: 'project', age: '3 天',
    updatedAt: '2026-11-14T08:00:00.000Z', acceptanceCount: 2, artifactCount: 0, logCount: 2, occupiesSlot: true,
  },
  {
    id: 'wo-20261115-1', title: '第一单：可玩的中国象棋飞行棋页面', stage: 'done', size: 'M',
    dri: 'engineer', driTitle: '工程师', scope: 'project', age: '9 天',
    updatedAt: '2026-11-08T10:00:00.000Z', acceptanceCount: 4, artifactCount: 1, logCount: 4, occupiesSlot: false,
  },
  {
    id: 'wo-20261116-2', title: '撤单那单：需求被并进工单看板', stage: 'dropped', size: 'S',
    dri: null, driTitle: null, scope: 'project', age: '1 天',
    updatedAt: '2026-11-16T10:00:00.000Z', acceptanceCount: 1, artifactCount: 0, logCount: 2, occupiesSlot: false,
  },
]

const ordersState = {
  ok: true,
  now: '2026-11-17T00:00:00.000Z',
  projectRoot: '/Users/you/src/app',
  globalDir: '/Users/you/.dsh/org',
  projectDir: '/Users/you/src/app/.dsh/org',
  // 3 occupied over a limit of 2 on purpose: the "over the limit" warning shows.
  wipLimit: 2,
  actor: { role: 'lead', label: 'lead', confirmed: true },
  stages: ['intake', 'active', 'review', 'blocked', 'done', 'dropped'],
  wipStages: ['active', 'review', 'blocked'],
  sizes: ['S', 'M', 'L'],
  occupied: 3,
  orders: orderRows,
  roles: [
    { id: 'engineer', title: '工程师', scope: 'project' },
    { id: 'reviewer', title: '验收评审员', scope: 'project' },
    { id: 'architect', title: '架构师', scope: 'global' },
  ],
  problems: [{ path: '/Users/you/src/app/.dsh/org/orders/wo-broken.json', message: 'Unexpected token } in JSON' }],
}

/** @param count - entries. @returns a log long enough to test the 100-entry fold. */
function makeLog(count) {
  const entries = []
  const base = Date.parse('2026-11-12T07:00:00.000Z')
  for (let index = 1; index <= count; index += 1) {
    const at = new Date(base + index * 37 * 60_000).toISOString()
    const by = index % 5 === 0 ? 'reviewer' : index % 3 === 0 ? 'architect' : 'engineer'
    const note = index === count
      ? 'update → review：五列与固定检查器都在，交付物入口只调 sidebarRight.openResource，没有自定义文件读取。'
      : `第 ${index} 条日志：规则只放在 lib/rules.js 与 store.js，面板不发第二套判断。`
    entries.push({ at, by, note })
  }
  return entries
}

const orderDetails = {
  'wo-20261116-1': {
    acceptance: [
      '五列（intake / active / review / blocked / done）+ 右侧固定检查器；done 只读进入，dropped 折叠成底部一条',
      '拖拽只是 PATCH /order/:id 的快捷方式：与 org_order update 同一个 updateWithRules → store.saveOrder，客户端不预判门禁',
      '拖进 done 得到 Host 的 done_forbidden 原文并回弹；拖进 dropped 必须先填理由（update 本来就要求 note）',
      "交付物只留「在 DSH 预览中打开」：客户端构造 dsh-resource 地址后调 ctx.get('sidebarRight').openResource，面板不读文件内容",
      '窄屏检查器可折叠、看板可横向滚动；空 / 加载 / 错误 / 无项目根 / 长标题 / 长日志都有可见处理',
    ],
    artifacts: [
      { path: 'docs/design/orders-tab.md', kind: 'file', bytes: 50637, absolutePath: '/Users/you/src/app/docs/design/orders-tab.md' },
      { path: 'docs/verify/orders-v2-1440.png', kind: 'missing' },
    ],
    log: makeLog(120),
  },
  'wo-20261115-2': {
    acceptance: ['规则只有一处实现', '面板与工具同一份 signBlockers', '在制上限建单时生效'],
    artifacts: [{ path: 'plugins/hyper-org/lib/rules.js', kind: 'file', bytes: 11403, absolutePath: '/Users/you/src/app/plugins/hyper-org/lib/rules.js' }],
    log: [
      { at: '2026-11-15T09:00:00.000Z', by: 'architect', note: '方案：规则下沉，store 一行不改。' },
      { at: '2026-11-15T10:30:00.000Z', by: 'engineer', note: 'Phase 0 完成，org-flow.test.js 未改动即全绿。' },
      { at: '2026-11-15T11:00:00.000Z', by: 'reviewer', note: '身份与日志 by 分离，避免误判自签。' },
    ],
  },
  'wo-20261114-4': {
    acceptance: [],
    artifacts: [],
    log: [{ at: '2026-11-11T08:00:00.000Z', by: 'lead', note: '在制满了，先排队：等一张在制单关掉。' }],
  },
  'wo-20261117-2': {
    acceptance: ['拿到接口权限', '补一条回放用例'],
    artifacts: [],
    log: [
      { at: '2026-11-14T08:00:00.000Z', by: 'lead', note: '建单：需要外部接口权限，先挂着。' },
      { at: '2026-11-14T09:10:00.000Z', by: 'engineer', note: 'blocked: 等运维开权限，预计明天。' },
    ],
  },
  'wo-20261115-1': {
    acceptance: ['纯静态，无网络请求，断网可玩', 'Canvas 绘制，适配 DPR', '规则与裁决一致', '交付物路径写进工单'],
    artifacts: [{ path: 'examples/flying-chess/index.html', kind: 'file', bytes: 84213, absolutePath: '/Users/you/src/app/examples/flying-chess/index.html' }],
    log: [
      { at: '2026-11-06T08:00:00.000Z', by: 'lead', note: '建单：参考飞行棋，先做能玩的一局。' },
      { at: '2026-11-06T09:00:00.000Z', by: 'architect', note: '方案：单文件、无依赖、状态机驱动。' },
      { at: '2026-11-06T10:00:00.000Z', by: 'engineer', note: '实现与截图落在 examples/flying-chess/。' },
      { at: '2026-11-06T11:00:00.000Z', by: 'reviewer', note: '验收通过：断网可玩，日志与产物对得上。' },
    ],
  },
  'wo-20261116-2': {
    acceptance: ['需求并入 wo-20261116-1 后可撤单'],
    artifacts: [],
    log: [
      { at: '2026-11-16T09:00:00.000Z', by: 'lead', note: '建单：独立改版。' },
      { at: '2026-11-16T10:00:00.000Z', by: 'lead', note: 'dropped: 需求并进 wo-20261116-1，避免两单同改一处。' },
    ],
  },
}

/**
 * Build one detail payload, derived from its board row so the two stay in sync.
 * @param {string} id - order id.
 * @param {string} demo - normal | empty | error | noproject.
 * @returns the `/order` fixture.
 */
function orderDocFor(id, demo) {
  const row = orderRows.find((entry) => entry.id === id) ?? orderRows[0]
  const detail = orderDetails[row.id] ?? { acceptance: [], artifacts: [], log: [] }
  const artifacts = demo === 'noproject'
    // No project root means `describeArtifact` cannot resolve anything, so the
    // panel only ever sees a dead row — never an absolute path.
    ? detail.artifacts.map((entry) => ({ path: entry.path, kind: 'missing' }))
    : detail.artifacts
  return {
    ok: true,
    scope: row.scope,
    path: `/Users/you/src/app/.dsh/org/orders/${row.id}.json`,
    order: {
      schemaVersion: 1,
      id: row.id,
      title: row.title,
      stage: row.stage,
      size: row.size,
      ...(row.dri === null ? {} : { dri: row.dri }),
      acceptance: detail.acceptance,
      artifacts: artifacts.map((entry) => entry.path),
      log: detail.log,
      createdAt: detail.log[0]?.at ?? row.updatedAt,
      updatedAt: row.updatedAt,
    },
    driTitle: row.driTitle,
    age: row.age,
    artifacts,
    sign: { allowed: true, blockers: [] },
  }
}

/** @param demo - the panel state. @returns the `/state` fixture. */
function ordersStateFor(demo) {
  if (demo === 'empty') return { ...ordersState, occupied: 0, orders: [] }
  if (demo === 'noproject') {
    return {
      ...ordersState,
      projectRoot: null,
      projectDir: null,
      occupied: 1,
      orders: orderRows.filter((row) => row.scope === 'global'),
    }
  }
  return ordersState
}

/** @param url - request URL. @param demo - the panel state. @returns a fetch response. */
function ordersResponse(url, demo) {
  if (demo === 'error') {
    return {
      ok: false,
      status: 500,
      json: async () => ({ ok: false, code: 'internal_error', error: 'Host 没有响应（preview 模拟）' }),
    }
  }
  const body = url.includes('/state')
    ? ordersStateFor(demo)
    : (() => {
        const id = new URL(url, 'http://localhost').searchParams.get('id') ?? 'wo-20261116-1'
        return orderDocFor(id, demo)
      })()
  return { ok: true, status: 200, json: async () => body }
}

/** @param url - request URL. @returns a fetch response for the roles/wiki pages. */
function fixtureFor(url) {
  if (kind === 'roles') {
    if (url.includes('/api/state')) return rolesState
    if (url.includes('/api/role/')) return roleDoc
    return { ok: true }
  }
  if (url.includes('/state')) return wikiState
  if (url.includes('/pages')) return { ok: true, scope: 'project', pages: wikiPages }
  if (url.includes('/drafts')) return { ok: true, scope: 'project', drafts: [] }
  if (url.includes('/pending')) return { ok: true, total: 1, scopes: [] }
  if (url.includes('/page')) return wikiPage
  if (url.includes('/search')) return { ok: true, scope: 'project', results: [] }
  if (url.includes('/backlinks')) return { ok: true, scope: 'project', backlinks: wikiPage.backlinks }
  return { ok: true }
}

// ------------------------------------------------------------------- the module
let registration
globalThis.window = { __ModuleLoader__: { load: (entry) => { registration = entry } } }
await import(`${clientFile}?t=${Date.now()}`)

/** Let pending promises and timers run. */
async function settle() {
  for (let index = 0; index < 4; index += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * Render one panel instance against one fixture set.
 *
 * The factory is called per mount on purpose: each mount gets its own hooks,
 * dictionary and fake services, exactly like two independent browser modules.
 * @param options - fixture, panel props and the fake sidebar record.
 * @returns {Promise<{html: string, sidebarCalls: string[], localeKeys: number}>}
 */
async function renderPanel(options) {
  const hooks = createHooks()
  const React = createReact(hooks)
  const plugin = registration.factory((name) => {
    if (name === 'react') return React
    throw new Error(`unexpected require: ${name}`)
  })

  const registered = []
  const dictionaries = {}
  const sidebarCalls = []
  globalThis.fetch = async (url) => options.fixture(String(url))

  const ctx = {
    effect: (factory) => factory(),
    get: (name) => (name === 'sidebarRight'
      ? { openResource: (address) => sidebarCalls.push(address) }
      : undefined),
    locale: {
      register: (namespace, value) => {
        dictionaries[namespace] = value
        return () => {}
      },
      bind: (namespace) => (key) => {
        const zh = (dictionaries[namespace] || {}).zh || {}
        return zh[key] === undefined ? key : zh[key]
      },
    },
    slots: {
      inject: (_owner, factory) => factory(),
      register: (registrationOptions, component) => {
        registered.push({ options: registrationOptions, component })
        return () => {}
      },
    },
  }
  plugin.apply(ctx)
  const target = registered.find((entry) => entry.options.name === 'conversation.view')
  if (target === undefined) throw new Error('no conversation.view registration')

  const props = { sessionId: 'session-preview', ...(options.props ?? {}) }
  let tree = null
  for (let iteration = 0; iteration < 30; iteration += 1) {
    hooks.begin()
    tree = target.component(props)
    const effects = hooks.take()
    const wasDirty = hooks.pending()
    hooks.clearDirty()
    for (const effect of effects) {
      const result = effect()
      if (typeof result === 'function') result()
    }
    await settle()
    if (!hooks.pending() && !wasDirty) break
  }
  return {
    html: toHtml(tree),
    sidebarCalls,
    localeKeys: Object.keys((dictionaries.hyperOrg || {}).zh || {}).length,
  }
}

// ------------------------------------------------------------------ serializing
const escape = (text) => String(text).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]))

/** @param style - style object. @returns CSS text. */
const styleText = (style) => Object.entries(style).map(([key, value]) => `${key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}:${value}`).join(';')

/** Attributes worth keeping in a static snapshot (the addresses are the point). */
const ATTR = /^(data-|aria-|title$|role$|tabindex$|draggable$)/

/**
 * Serialize a rendered tree.
 * @param node - element, string, or array.
 * @param context - the enclosing select's value, so `selected` is right.
 * @returns HTML text.
 */
function toHtml(node, context = {}) {
  if (node === null || node === undefined || node === false || node === true) return ''
  if (Array.isArray(node)) return node.map((child) => toHtml(child, context)).join('')
  if (typeof node === 'string' || typeof node === 'number') return escape(node)
  const { type, props: elementProps, children } = node
  if (type === FRAGMENT) return children.map((child) => toHtml(child, context)).join('')
  if (typeof type === 'function') {
    return toHtml(type({ ...elementProps, children: children.length === 1 ? children[0] : children }), context)
  }
  const attrs = []
  if (elementProps.className) attrs.push(`class="${escape(elementProps.className)}"`)
  if (elementProps.style) attrs.push(`style="${escape(styleText(elementProps.style))}"`)
  if (elementProps.value !== undefined && type !== 'textarea' && type !== 'option') {
    attrs.push(`value="${escape(elementProps.value)}"`)
  }
  if (elementProps.placeholder) attrs.push(`placeholder="${escape(elementProps.placeholder)}"`)
  if (elementProps.disabled) attrs.push('disabled')
  if (elementProps.open) attrs.push('open')
  if (elementProps.rows) attrs.push(`rows="${elementProps.rows}"`)
  if (type === 'option' && context.selectedValue !== undefined && elementProps.value === context.selectedValue) {
    attrs.push('selected')
  }
  for (const [key, value] of Object.entries(elementProps)) {
    if (value === undefined || value === null || typeof value !== 'string' && typeof value !== 'number') continue
    if (key === 'className' || key === 'style' || key === 'value' || key === 'placeholder' || key === 'children') continue
    if (key === 'disabled' || key === 'open' || key === 'rows') continue
    const name = key === 'tabIndex' ? 'tabindex' : key
    if (!ATTR.test(name)) continue
    attrs.push(`${name}="${escape(value)}"`)
  }
  const body = type === 'select'
    ? children.map((child) => toHtml(child, { selectedValue: elementProps.value })).join('')
    : children.map((child) => toHtml(child, context)).join('')
  if (type === 'input') return `<input ${attrs.join(' ')}>`
  if (type === 'textarea') return `<textarea ${attrs.join(' ')}>${elementProps.value === undefined ? body : escape(elementProps.value)}</textarea>`
  if (type === 'style') return ''
  return `<${type}${attrs.length === 0 ? '' : ` ${attrs.join(' ')}`}>${body}</${type}>`
}

// --------------------------------------------------------------------- the page
const mounts = kind === 'orders'
  ? {
      main: await renderPanel({ fixture: (url) => ordersResponse(url, 'normal') }),
      empty: await renderPanel({ fixture: (url) => ordersResponse(url, 'empty') }),
      error: await renderPanel({ fixture: (url) => ordersResponse(url, 'error') }),
      noproject: await renderPanel({ fixture: (url) => ordersResponse(url, 'noproject') }),
    }
  : { main: await renderPanel({ fixture: async (url) => ({ ok: true, status: 200, json: async () => fixtureFor(url) }) }) }

const panelNote = kind === 'orders'
  ? `<div class="pv-head">
      <b>工单看板 v2 · 五列 + 固定检查器</b>
      <span class="pv-mut">预览面板：<a href="?panel=main">正常</a> · <a href="?panel=empty">空态</a> · <a href="?panel=error">错误</a> · <a href="?panel=noproject">无项目根</a></span>
      <span class="pv-mut">交付物按钮带真实 <code>data-address</code>；点击后由页面里的假 sidebarRight 弹出右栏 mock（真实 GUI 用 DSH 自己的文档预览）。</span>
    </div>`
  : ''

const statePanel = (key, label, note) => `<section class="pv-state" data-panel="${key}" hidden>
  <header class="pv-state-head"><b>${label}</b><span>${note}</span></header>
  <div class="pv-mount">${mounts[key].html}</div>
</section>`

const mainPanel = `<section class="pv-main" data-panel="main" hidden>
  <div class="pv-mount">${mounts.main.html}</div>
</section>`

const stateSections = kind === 'orders'
  ? `${statePanel('empty', '空态 · orders: []', '空看板不是错误；新建入口仍可用，右下角状态不明说就不算完成。')}
     ${statePanel('error', '错误态 · /state → 500', '错误必须落在可见错误条上，并给出重试；看板结构保留。')}
     ${statePanel('noproject', '无项目根 · projectRoot: null', '黄条说明 + 作用域锁 global；交付物解析不出绝对路径，按钮禁用并解释。')}`
  : ''

const shell = `<!doctype html>
<html lang="zh-CN" data-theme="light">
<head><meta charset="utf-8"><title>preview · ${kind}</title>
<style>
  :root { --dsw-alias-bg-base:#f4f5f7; --dsw-alias-bg-layer-1:#ffffff; --dsw-alias-bg-layer-2:#f8f9fb;
    --dsw-alias-border-l1:#e5e7eb; --dsw-alias-border-l2:#d6dae1; --dsw-alias-label-primary:#1f2328;
    --dsw-alias-label-secondary:#6b7280; --dsw-alias-brand-primary:#2563eb; --dsw-alias-state-error-primary:#dc2626;
    --dsw-alias-state-warn-primary:#b45309; --dsw-alias-state-success-primary:#16a34a; }
  html[data-theme="dark"] { --dsw-alias-bg-base:#15171b; --dsw-alias-bg-layer-1:#1c1f24; --dsw-alias-bg-layer-2:#22262c;
    --dsw-alias-border-l1:#2b3037; --dsw-alias-border-l2:#3a4048; --dsw-alias-label-primary:#e6e8eb;
    --dsw-alias-label-secondary:#9aa1ab; --dsw-alias-brand-primary:#6d9bff; --dsw-alias-state-error-primary:#f87171;
    --dsw-alias-state-warn-primary:#fbbf24; --dsw-alias-state-success-primary:#4ade80; }
  /* no global box-sizing: the panel must carry its own, as it does in the app. */
  body { margin:0; background:var(--dsw-alias-bg-base); color:var(--dsw-alias-label-primary);
    font:13px/1.55 -apple-system,"PingFang SC","Segoe UI",system-ui,sans-serif; height:100vh; overflow:hidden; }
  .shell { display:grid; grid-template-columns:54px 232px minmax(0,1fr); height:100vh; }
  .rail { background:var(--dsw-alias-bg-layer-2); border-right:1px solid var(--dsw-alias-border-l1); }
  .side { background:var(--dsw-alias-bg-layer-2); border-right:1px solid var(--dsw-alias-border-l1); padding:12px 10px; }
  .side div { height:28px; margin:4px 0; border-radius:6px; background:var(--dsw-alias-bg-layer-1); opacity:.6; }
  .main { display:flex; flex-direction:column; min-width:0; min-height:0; }
  .sesshead { background:var(--dsw-alias-bg-layer-1); border-bottom:1px solid var(--dsw-alias-border-l1); padding:14px 20px 0; }
  .sesstop { display:flex; justify-content:space-between; color:var(--dsw-alias-label-secondary); font-size:11.5px; }
  .sesstop b { color:var(--dsw-alias-label-primary); font-size:14px; font-weight:600; }
  .tabs { display:flex; gap:4px; margin-top:10px; color:var(--dsw-alias-label-secondary); font-size:12.5px; }
  .tabs span { padding:8px 10px 9px; border-bottom:2px solid transparent; }
  .tabs .on { color:var(--dsw-alias-label-primary); border-bottom-color:var(--dsw-alias-brand-primary); font-weight:550; }
  .viewArea { display:flex; flex:1; flex-direction:column; min-height:0; }
  [hidden] { display:none !important; }
  .pv-head { display:flex; flex-wrap:wrap; gap:4px 14px; align-items:baseline; padding:6px 14px;
    border-bottom:1px dashed var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-2);
    font-size:11px; color:var(--dsw-alias-label-secondary); flex:none; }
  .pv-head b { color:var(--dsw-alias-label-primary); font-size:11.5px; }
  .pv-head a { color:var(--dsw-alias-brand-primary); text-decoration:none; }
  .pv-head a:hover { text-decoration:underline; }
  .pv-mut { color:var(--dsw-alias-label-secondary); }
  .pv-main { display:flex; flex:1 1 auto; min-width:0; min-height:0; }
  .pv-main .pv-mount { display:flex; flex:1 1 auto; min-width:0; flex-direction:column; min-height:0; }
  .pv-state { position:fixed; inset:70px 0 0 0; display:flex; flex-direction:column; padding:14px;
    background:var(--dsw-alias-bg-base); z-index:40; }
  .pv-state-head { display:flex; gap:12px; align-items:baseline; padding:0 4px 8px; font-size:12px;
    color:var(--dsw-alias-label-secondary); flex:none; }
  .pv-state-head b { color:var(--dsw-alias-label-primary); font-size:13px; }
  .pv-state .pv-mount { display:flex; flex:1 1 auto; flex-direction:column; min-height:0;
    border:1px solid var(--dsw-alias-border-l1); border-radius:10px; background:var(--dsw-alias-bg-layer-1);
    overflow:hidden; }
  #dswPreview { position:fixed; top:56px; right:0; bottom:0; width:380px; display:none; z-index:50;
    background:var(--dsw-alias-bg-layer-1); border-left:1px solid var(--dsw-alias-border-l1);
    box-shadow:-12px 0 36px rgba(15,23,42,.14); flex-direction:column; }
  #dswPreview.on { display:flex; }
  #dswPreview header { display:flex; align-items:center; gap:8px; padding:10px 12px;
    border-bottom:1px solid var(--dsw-alias-border-l1); font-size:12px; font-weight:600; }
  #dswPreview header button { margin-left:auto; }
  #dswPreview .pv-addr { margin:10px 12px; padding:8px; border-radius:8px; font-size:10.5px; word-break:break-all;
    font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
    background:var(--dsw-alias-bg-layer-2); border:1px solid var(--dsw-alias-border-l1); }
  #dswPreview .pv-body { padding:0 12px 12px; overflow:auto; font-size:12px; color:var(--dsw-alias-label-secondary); }
  #dswPreview code { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
</style>
<style>${styles}</style>
</head>
<body>
<div class="shell">
  <aside class="rail"></aside>
  <aside class="side"><div></div><div></div><div></div><div></div><div></div><div></div></aside>
  <main class="main">
    <header class="sesshead">
      <div class="sesstop"><b>岗位与 wiki 评审</b><span>deepseek-v4.1 · 增强创造模式</span></div>
      <nav class="tabs"><span>对话</span><span>轨迹</span><span>统计</span><span>岗位</span><span>Wiki</span><span class="${kind === 'orders' ? 'on' : ''}">工单</span></nav>
    </header>
    ${panelNote}
    <div class="viewArea">
      ${mainPanel}
      ${stateSections}
    </div>
  </main>
</div>
<aside id="dswPreview" aria-label="DSH 右侧栏 mock">
  <header>DSH 文档预览 · 右侧栏 mock <button type="button" id="dswClose">关闭</button></header>
  <div class="pv-addr" id="dswAddr"></div>
  <div class="pv-body">
    <p>真实实现：<code>ctx.get('sidebarRight').openResource(address)</code>，由 DSH 自己渲染 Markdown / 代码 / 图片 / PDF / Office / HTML。</p>
    <p>这个障碍物只是预览页的 mock：它证明按钮构造的地址就是 <code>dsh-resource://file/session/…</code>，不是面板自绘的文本预览。</p>
  </div>
</aside>
<script>
  // The panel mounts are static snapshots; ?panel= picks which state is shown.
  const wanted = new URLSearchParams(location.search).get('panel') || 'main';
  document.querySelectorAll('[data-panel]').forEach((node) => { node.hidden = node.dataset.panel !== wanted; });
  // Fake sidebarRight: clicking a deliverable shows the address it would open.
  const preview = document.getElementById('dswPreview');
  const address = document.getElementById('dswAddr');
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest && event.target.closest('.ho-art-open');
    if (trigger === undefined || trigger === null) return;
    if (trigger.disabled) return;
    address.textContent = trigger.dataset.address || '(no address)';
    preview.classList.add('on');
  });
  document.getElementById('dswClose').addEventListener('click', () => preview.classList.remove('on'));
  globalThis.__previewReady = true;
</script>
</body>
</html>`

const out = join(root, `docs/demo/preview-${kind}.html`)
writeFileSync(out, shell, 'utf8')
console.log(`wrote ${out}`)
