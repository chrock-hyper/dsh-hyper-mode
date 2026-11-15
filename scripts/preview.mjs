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
      if (!cells[index]) cells[index] = { state: typeof initial === 'function' ? initial() : initial }
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

const hooks = createHooks()
const Fragment = Symbol('Fragment')
const React = {
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

// The board fixture mirrors the real payloads from `/hyper-org/api`: one order
// per stage, so grouping, aging, the six detail items and the sign panel are all
// visible in one page.
const orderRows = [
  {
    id: 'wo-20261115-2', title: '工单看板：会话内「工单」标签页', stage: 'active', size: 'M',
    dri: 'engineer', driTitle: '工程师', scope: 'project', age: '6 小时',
    updatedAt: '2026-11-15T09:30:00.000Z', acceptanceCount: 6, artifactCount: 1, logCount: 1, occupiesSlot: true,
  },
  {
    id: 'wo-20261115-3', title: '键盘导航：会话内快捷键与焦点环', stage: 'review', size: 'S',
    dri: 'engineer', driTitle: '工程师', scope: 'project', age: '2 天',
    updatedAt: '2026-11-13T12:00:00.000Z', acceptanceCount: 2, artifactCount: 1, logCount: 3, occupiesSlot: true,
  },
  {
    id: 'wo-20261114-4', title: '把工单脉冲写进系统提示：只给主代理看的那一段', stage: 'intake', size: 'L',
    dri: null, driTitle: null, scope: 'global', age: '3 天',
    updatedAt: '2026-11-12T08:00:00.000Z', acceptanceCount: 3, artifactCount: 0, logCount: 1, occupiesSlot: false,
  },
  {
    id: 'wo-20261115-1', title: '第一单：可玩的中国象棋飞行棋页面', stage: 'done', size: 'M',
    dri: 'engineer', driTitle: '工程师', scope: 'project', age: '9 天',
    updatedAt: '2026-11-06T10:00:00.000Z', acceptanceCount: 4, artifactCount: 2, logCount: 4, occupiesSlot: false,
  },
]

const ordersState = {
  ok: true,
  now: '2026-11-15T15:39:21.000Z',
  projectRoot: '/Users/you/src/app',
  globalDir: '/Users/you/.dsh/org',
  projectDir: '/Users/you/src/app/.dsh/org',
  wipLimit: 2,
  // Bound to engineer, so the review order below shows the self-sign blocker.
  actor: { role: 'engineer', label: 'engineer', confirmed: true },
  stages: ['intake', 'active', 'review', 'blocked', 'done', 'dropped'],
  wipStages: ['active', 'review', 'blocked'],
  sizes: ['S', 'M', 'L'],
  occupied: 2,
  orders: orderRows,
  roles: [
    { id: 'engineer', title: '工程师', scope: 'project' },
    { id: 'reviewer', title: '验收评审员', scope: 'project' },
    { id: 'architect', title: '架构师', scope: 'global' },
  ],
  problems: [{ path: '/Users/you/src/app/.dsh/org/orders/wo-broken.json', message: 'Unexpected token } in JSON' }],
}

const sixCriteria = [
  '会话内出现「工单」标签页，与「岗位」「Wiki」同排；没有会话时不显示',
  '看板按阶段分组：intake / active / review / blocked / done，显示在制 x/wipLimit、超龄时长、领取人岗位名',
  '点开一张单能看到六项：验收标准、完整日志、交付物路径（可点开）、规模、DRI、当前阶段',
  '面板可建单（标题 / 规模 / DRI / 验收标准），且受同一套门禁约束：M/L 无验收标准不能进 active、在制满时落 intake',
  '签收必须写 note，且领取人不能给自己签；面板与 org_order 用同一套规则，不是两套',
  '不改变数据格式：.dsh/org 仍是唯一数据源，老工单文件不用迁移',
]

const orderDetails = {
  'wo-20261115-2': {
    acceptance: sixCriteria,
    artifacts: [
      { path: 'docs/design/orders-tab.md', kind: 'file', bytes: 41388 },
      { path: 'missing/screenshot.png', kind: 'missing' },
    ],
    log: [
      { at: '2026-11-15T09:30:00.000Z', by: 'architect', note: '方案定稿：路由前缀 /hyper-org/api，标签页 order=70（岗位 50 / Wiki 60，避免撞号）。' },
      { at: '2026-11-15T11:10:00.000Z', by: 'engineer', note: 'Phase 0：把 note/自签与 DRI 校验下沉到 lib/rules.js，org-flow.test.js 未改动即全绿。' },
      { at: '2026-11-15T14:05:00.000Z', by: 'reviewer', note: '签收身份与日志 by 分离，避免未绑定会话被误判为自签。' },
    ],
  },
  'wo-20261115-3': {
    acceptance: ['Tab 顺序与视觉顺序一致', 'Esc 关闭浮层，焦点回到触发元素'],
    artifacts: [{ path: 'plugins/hyper-roles/client/client.js', kind: 'file', bytes: 33712 }],
    log: [
      { at: '2026-11-13T09:00:00.000Z', by: 'lead', note: '建单：键盘可用的最小集，先覆盖标签页切换与浮层关闭。' },
      { at: '2026-11-13T10:30:00.000Z', by: 'engineer', note: '实现落盘：焦点环用 :focus-visible，Esc 走 keydown 冒泡。' },
      { at: '2026-11-13T12:00:00.000Z', by: 'engineer', note: 'update → review：两条标准都有截图证据，等签字。' },
    ],
    blockers: [{
      code: 'self_sign',
      message: '工单 wo-20261115-3 的领取人是 engineer：验收不能由领取人自己签',
    }],
  },
  'wo-20261114-4': {
    acceptance: ['脉冲只出现在主代理系统提示', '绑定岗位的子代理看不到它', '脉冲行数不超过配置'],
    artifacts: [],
    log: [{ at: '2026-11-12T08:00:00.000Z', by: 'architect', note: '在制满了，先排队：这一单等看板落地后再排。' }],
  },
  'wo-20261115-1': {
    acceptance: ['纯静态，无网络请求，断网可玩', 'Canvas 绘制，适配 DPR', '规则与裁决一致', '交付物路径写进工单'],
    artifacts: [{ path: 'examples/flying-chess/index.html', kind: 'file', bytes: 84213 }],
    log: [
      { at: '2026-11-06T08:00:00.000Z', by: 'lead', note: '建单：参考飞行棋，先做能玩的一局。' },
      { at: '2026-11-06T09:00:00.000Z', by: 'architect', note: '方案：单文件、无依赖、状态机驱动。' },
      { at: '2026-11-06T10:00:00.000Z', by: 'engineer', note: '实现与截图落在 examples/flying-chess/。' },
      { at: '2026-11-06T11:00:00.000Z', by: 'reviewer', note: '验收通过：断网可玩，日志与产物对得上。' },
    ],
  },
}

/**
 * Build one detail payload, derived from its board row so the two stay in sync.
 * @param {string} id - order id.
 * @returns the `/order` fixture.
 */
function orderDocFor(id) {
  const row = orderRows.find((entry) => entry.id === id) ?? orderRows[0]
  const detail = orderDetails[row.id] ?? { acceptance: [], artifacts: [], log: [] }
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
      artifacts: detail.artifacts.map((entry) => entry.path),
      log: detail.log,
      createdAt: detail.log[0]?.at ?? row.updatedAt,
      updatedAt: row.updatedAt,
    },
    driTitle: row.driTitle,
    age: row.age,
    artifacts: detail.artifacts,
    sign: { allowed: (detail.blockers ?? []).length === 0, blockers: detail.blockers ?? [] },
  }
}

/** @param {string} url - request URL. @returns the fixture body. */
function fixtureFor(url) {
  if (kind === 'orders') {
    if (url.includes('/state')) return ordersState
    if (url.includes('/artifact')) {
      return {
        ok: true,
        path: 'docs/design/orders-tab.md',
        bytes: 41388,
        truncated: false,
        text: '# 工单看板（会话内「工单」标签页）· 开工方案\n\n- 工单：wo-20261115-2\n- 状态：方案，可直接开工\n\n## 0. 结论摘要\n\n1. 路由前缀用 /hyper-org/api\n2. 标签页 order 必须用 70，不是 60\n3. 规则复用：lib/rules.js\n',
      }
    }
    if (url.includes('/order')) {
      const id = new URL(url, 'http://localhost').searchParams.get('id') ?? 'wo-20261115-3'
      return orderDocFor(id)
    }
    return { ok: true }
  }
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

globalThis.fetch = async (url) => ({
  ok: true,
  status: 200,
  json: async () => fixtureFor(String(url)),
})

// ------------------------------------------------------------------- the module
let registration
globalThis.window = { __ModuleLoader__: { load: (entry) => { registration = entry } } }
await import(`${clientFile}?t=${Date.now()}`)
const plugin = registration.factory((name) => {
  if (name === 'react') return React
  throw new Error(`unexpected require: ${name}`)
})

const registered = []
// Resolve the panel's own dictionary so the page shows the words a user sees,
// not the locale keys: label width is part of the layout being checked.
const dictionaries = {}
const ctx = {
  effect: (factory) => factory(),
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
    register: (options, component) => { registered.push({ options, component }); return () => {} },
  },
}
plugin.apply(ctx)
const target = registered.find((entry) => entry.options.name === 'conversation.view')
if (target === undefined) throw new Error('no conversation.view registration')

// ------------------------------------------------------------------- rendering
const props = { sessionId: 'session-preview' }
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

/** Let pending promises and timers run. */
async function settle() {
  for (let index = 0; index < 4; index += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

// ------------------------------------------------------------------ serializing
const escape = (text) => String(text).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]))

/** @param {object} style - style object. @returns CSS text. */
const styleText = (style) => Object.entries(style).map(([key, value]) => `${key.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`)}:${value}`).join(';')

/**
 * Serialize a rendered tree.
 * @param node - element, string, or array.
 * @returns HTML text.
 */
function toHtml(node) {
  if (node === null || node === undefined || node === false || node === true) return ''
  if (Array.isArray(node)) return node.map(toHtml).join('')
  if (typeof node === 'string' || typeof node === 'number') return escape(node)
  const { type, props: elementProps, children } = node
  if (type === Fragment) return children.map(toHtml).join('')
  if (typeof type === 'function') {
    return toHtml(type({ ...elementProps, children: children.length === 1 ? children[0] : children }))
  }
  const attrs = []
  if (elementProps.className) attrs.push(`class="${escape(elementProps.className)}"`)
  if (elementProps.style) attrs.push(`style="${escape(styleText(elementProps.style))}"`)
  if (elementProps.value !== undefined) attrs.push(`value="${escape(elementProps.value)}"`)
  if (elementProps.placeholder) attrs.push(`placeholder="${escape(elementProps.placeholder)}"`)
  if (elementProps.disabled) attrs.push('disabled')
  if (elementProps.open) attrs.push('open')
  if (elementProps.rows) attrs.push(`rows="${elementProps.rows}"`)
  const body = children.map(toHtml).join('')
  if (type === 'input') return `<input ${attrs.join(' ')}>`
  if (type === 'textarea') return `<textarea ${attrs.join(' ')}>${elementProps.value === undefined ? body : escape(elementProps.value)}</textarea>`
  if (type === 'style') return ''
  return `<${type}${attrs.length === 0 ? '' : ` ${attrs.join(' ')}`}>${body}</${type}>`
}

const mount = toHtml(tree)

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
  .main { display:flex; flex-direction:column; min-width:0; }
  .sesshead { background:var(--dsw-alias-bg-layer-1); border-bottom:1px solid var(--dsw-alias-border-l1); padding:14px 20px 0; }
  .sesstop { display:flex; justify-content:space-between; color:var(--dsw-alias-label-secondary); font-size:11.5px; }
  .sesstop b { color:var(--dsw-alias-label-primary); font-size:14px; font-weight:600; }
  .tabs { display:flex; gap:4px; margin-top:10px; color:var(--dsw-alias-label-secondary); font-size:12.5px; }
  .tabs span { padding:8px 10px 9px; border-bottom:2px solid transparent; }
  .tabs .on { color:var(--dsw-alias-label-primary); border-bottom-color:var(--dsw-alias-brand-primary); font-weight:550; }
  .viewArea { display:flex; flex:1; flex-direction:column; min-height:0; }
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
      <nav class="tabs"><span>对话</span><span>轨迹</span><span>统计</span><span class="${kind === 'roles' ? 'on' : ''}">岗位</span><span class="${kind === 'wiki' ? 'on' : ''}">Wiki</span><span class="${kind === 'orders' ? 'on' : ''}">工单</span></nav>
    </header>
    <div class="viewArea" id="mount">${mount}</div>
  </main>
</div>
<script>globalThis.__previewReady = true</script>
</body>
</html>`

const out = join(root, `docs/demo/preview-${kind}.html`)
writeFileSync(out, shell, 'utf8')
console.log(`wrote ${out}`)
