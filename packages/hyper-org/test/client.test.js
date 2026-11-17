/**
 * The panel is a bundled browser module: the build wraps the emitted CJS chunk
 * in one `window.__ModuleLoader__.load({ id, factory })` registration, and the
 * factory renders with React from the page's module table. This harness stubs
 * both, so the contract worth testing is: the module registers under the nested
 * package name, the tab lands in `conversation.view` beside 岗位 (50) and Wiki
 * (60), the board renders five columns plus a fixed inspector, a deliverable
 * opens through DSH's own sidebar service (never through a Host file read), and
 * a stage move is one request no matter whether a card was dropped or the stage
 * menu was used.
 *
 * It loads the build output (`lib/client.js`), not the source, because that file
 * is what the page actually receives: the module format, the wrapper and the
 * JSX transform are part of the contract. The fake `require` therefore answers
 * the two externals the bundle keeps — `react` and `react/jsx-runtime`.
 */
import { describe, expect, test } from 'bun:test'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** A minimal hook runtime that can render, run effects, and render again. */
function createHooks() {
  let cursor = 0
  let effects = []
  const states = []
  return {
    begin() {
      cursor = 0
      effects = []
    },
    take() {
      return effects.splice(0)
    },
    useState(initial) {
      const index = cursor
      cursor += 1
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial
      return [states[index], (next) => {
        states[index] = typeof next === 'function' ? next(states[index]) : next
      }]
    },
    useCallback(callback) {
      cursor += 1
      return callback
    },
    useEffect(effect) {
      cursor += 1
      effects.push(effect)
    },
  }
}

/** @param hooks - the hook runtime. @returns the React stand-in the client destructures. */
function createReact(hooks) {
  const Fragment = Symbol('Fragment')
  return {
    Fragment,
    createElement(type, props, ...children) {
      return { type, props: props || {}, children: children.flat(Infinity).filter((child) => child !== null && child !== false) }
    },
    useState: hooks.useState,
    useCallback: hooks.useCallback,
    useEffect: hooks.useEffect,
  }
}

/** Let the fetch promises settle. */
async function settle() {
  for (let index = 0; index < 6; index += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

/**
 * The automatic JSX runtime the bundle destructures with `require`.
 *
 * `jsx`/`jsxs` take `(type, props, key)`; mapping `props.children` back onto the
 * fake `createElement(type, props, ...children)` keeps the recorded tree
 * identical to what the hand-written `h(...)` calls produced.
 * @param React - the fake React runtime to build elements with.
 * @returns the fake `react/jsx-runtime` module.
 */
function createJsxRuntime(React) {
  const jsx = (type, props, key) => {
    const { children, ...rest } = props || {}
    const nextProps = key === undefined ? rest : { ...rest, key }
    const childList = children === undefined ? [] : (Array.isArray(children) ? children : [children])
    return React.createElement(type, nextProps, ...childList)
  }
  return { jsx, jsxs: jsx, jsxDEV: jsx, Fragment: React.Fragment }
}

const boardState = {
  ok: true,
  now: '2026-11-17T00:00:00.000Z',
  projectRoot: '/tmp/project',
  globalDir: '/tmp/home/org',
  projectDir: '/tmp/project/.dsh/org',
  wipLimit: 2,
  actor: { role: 'lead', label: 'lead', confirmed: true },
  stages: ['intake', 'active', 'review', 'blocked', 'done', 'dropped'],
  wipStages: ['active', 'review', 'blocked'],
  sizes: ['S', 'M', 'L'],
  occupied: 2,
  orders: [
    {
      id: 'wo-20261115-2', title: '在制那单', stage: 'active', size: 'M', dri: 'engineer', driTitle: '工程师',
      scope: 'project', age: '2 天', updatedAt: '2026-11-15T00:00:00.000Z',
      acceptanceCount: 2, artifactCount: 0, logCount: 2, occupiesSlot: true,
    },
    {
      id: 'wo-20261115-3', title: '待验收那单', stage: 'review', size: 'M', dri: 'engineer', driTitle: '工程师',
      scope: 'project', age: '5 天', updatedAt: '2026-11-12T00:00:00.000Z',
      acceptanceCount: 2, artifactCount: 1, logCount: 2, occupiesSlot: true,
    },
    {
      id: 'wo-20261114-4', title: '排队那单', stage: 'intake', size: 'L', dri: null, driTitle: null,
      scope: 'global', age: '6 天', updatedAt: '2026-11-11T00:00:00.000Z',
      acceptanceCount: 0, artifactCount: 0, logCount: 1, occupiesSlot: false,
    },
    {
      id: 'wo-20261115-1', title: '已签收那单', stage: 'done', size: 'M', dri: 'engineer', driTitle: '工程师',
      scope: 'project', age: '9 天', updatedAt: '2026-11-08T00:00:00.000Z',
      acceptanceCount: 4, artifactCount: 1, logCount: 4, occupiesSlot: false,
    },
    {
      id: 'wo-20261116-2', title: '撤单那单', stage: 'dropped', size: 'S', dri: null, driTitle: null,
      scope: 'project', age: '3 天', updatedAt: '2026-11-14T00:00:00.000Z',
      acceptanceCount: 1, artifactCount: 0, logCount: 2, occupiesSlot: false,
    },
  ],
  roles: [{ id: 'engineer', title: '工程师', scope: 'project' }],
  problems: [],
}

const orderDoc = {
  ok: true,
  scope: 'project',
  path: '/tmp/project/.dsh/org/orders/wo-20261115-3.json',
  order: {
    schemaVersion: 1,
    id: 'wo-20261115-3',
    title: '待验收那单',
    stage: 'review',
    size: 'M',
    dri: 'engineer',
    acceptance: ['五列都在', '交付物不开自定义读取'],
    artifacts: ['docs/design/orders-tab.md'],
    log: [
      { at: '2026-11-15T08:00:00.000Z', by: 'architect', note: '方案定稿' },
      { at: '2026-11-15T09:30:00.000Z', by: 'engineer', note: '实现落盘' },
    ],
    createdAt: '2026-11-15T08:00:00.000Z',
    updatedAt: '2026-11-12T00:00:00.000Z',
  },
  driTitle: '工程师',
  age: '5 天',
  artifacts: [{
    path: 'docs/design/orders-tab.md',
    kind: 'file',
    bytes: 41388,
    absolutePath: '/tmp/project/docs/design/orders-tab.md',
  }],
  sign: { allowed: true, blockers: [] },
}

// The module registers once per page load; every test gets a fresh factory
// closure (and therefore a fresh `t`, fresh services) from the same entry.
let registration
globalThis.window = { __ModuleLoader__: { load: (entry) => { registration = entry } } }
await import(pathToFileURL(join(import.meta.dir, '../lib/client.js')).href)

/** Load the module and register it against a fake client context. */
function loadClient(options = {}) {
  const hooks = createHooks()
  const React = createReact(hooks)
  const jsxRuntime = createJsxRuntime(React)
  const app = registration.factory((name) => {
    if (name === 'react') return React
    if (name === 'react/jsx-runtime') return jsxRuntime
    throw new Error(`unexpected require: ${name}`)
  })

  const calls = []
  const components = {}
  const dictionaries = {}
  const sidebarCalls = []
  const sidebar = options.sidebar === 'missing'
    ? undefined
    : { openResource: (address) => sidebarCalls.push(address) }
  const ctx = {
    effect(factory, label) {
      calls.push(['effect', label])
      return factory()
    },
    get(name) {
      return name === 'sidebarRight' ? sidebar : undefined
    },
    locale: {
      register(namespace, value) {
        dictionaries[namespace] = value
        calls.push(['locale', namespace, Object.keys(value).sort()])
        return () => {}
      },
      bind: (namespace) => (key) => {
        const zh = (dictionaries[namespace] || {}).zh || {}
        return zh[key] === undefined ? key : zh[key]
      },
    },
    slots: {
      inject(owner, factory) {
        calls.push(['inject', owner])
        return factory()
      },
      register(options_, component) {
        calls.push(['register', options_.name, options_])
        components.panel = component
        return () => {}
      },
    },
  }
  app.apply(ctx)
  return { registration, app, hooks, calls, components, dictionaries, sidebarCalls }
}

/** @param node - rendered tree. @returns host-element tree. */
function expand(node) {
  if (node === null || node === undefined) return null
  if (Array.isArray(node)) return node.map(expand).filter((child) => child !== null)
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  const { type, props, children } = node
  if (typeof type === 'function') {
    return expand(type({ ...props, children: children.length === 1 ? children[0] : children }))
  }
  return { type, props, children: children.map(expand).filter((child) => child !== null) }
}

/** @param node - rendered tree. @returns all text, flattened. */
function textOf(node) {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  return (node.children || []).map(textOf).join(' ')
}

/** @param node - tree root. @param visit - per element. */
function walk(node, visit) {
  if (node === null || node === undefined || typeof node === 'string') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  visit(node)
  walk(node.children, visit)
}

/** @param node - tree root. @param predicate - match. @returns every match. */
function findAll(node, predicate) {
  const found = []
  walk(node, (element) => {
    if (predicate(element)) found.push(element)
  })
  return found
}

/** @param node - tree root. @param predicate - match. @returns the first match. */
function find(node, predicate) {
  return findAll(node, predicate)[0]
}

/** @param client - loaded client. @returns a rendered tree, after the board and detail arrive. */
async function mount(client, props = { sessionId: 'sess-1' }) {
  let tree = null
  for (let iteration = 0; iteration < 6; iteration += 1) {
    client.hooks.begin()
    tree = client.components.panel(props)
    const effects = client.hooks.take()
    for (const effect of effects) {
      const cleanup = effect()
      if (typeof cleanup === 'function') cleanup()
    }
    await settle()
  }
  return expand(tree)
}

/** Install a fetch that records every call and answers from the fixtures. */
function recordFetch(seen) {
  globalThis.fetch = async (url, options) => {
    seen.push({ url: String(url), method: options?.method ?? 'GET', body: options?.body })
    return {
      ok: true,
      status: 200,
      json: async () => (String(url).includes('/state') ? boardState : orderDoc),
    }
  }
}

const helper = () => loadClient().app.__test

describe('client module', () => {
  const client = loadClient()

  test('registers one lazy factory under the nested package name', () => {
    expect(client.registration.id).toBe('@chrock-hyper/dsh-hyper-org')
    expect(typeof client.registration.factory).toBe('function')
  })

  test('declares its client services and the fourth conversation tab', () => {
    const { calls } = client
    expect(client.app.inject).toEqual(['slots', 'locale'])
    expect(calls[0]).toEqual(['effect', 'hyper-org: dictionaries'])

    const locale = calls.find((row) => row[0] === 'locale')
    expect(locale[1]).toBe('hyperOrg')
    expect(locale[2]).toEqual(['en', 'zh'])
    // Same key set in both languages: no half-translated state.
    const dictionary = client.dictionaries.hyperOrg
    expect(Object.keys(dictionary.zh).sort()).toEqual(Object.keys(dictionary.en).sort())

    expect(calls.filter((row) => row[0] === 'inject').map((row) => row[1])).toEqual(['conversation.view'])

    const tab = calls.find((row) => row[0] === 'register' && row[1] === 'conversation.view')
    expect(tab[2].id).toBe('orders')
    // 岗位 50 / Wiki 60 — 70 keeps this tab to their right instead of colliding.
    expect(tab[2].order).toBe(70)
    expect(tab[2].locale).toBe('hyperOrg')
    expect(tab[2].label()).toBe('工单')
    expect(typeof client.components.panel).toBe('function')
  })

  test('builds the DSH preview address exactly like sessionFileAddress', () => {
    const { sessionFileAddress } = helper()
    // An absolute path keeps its absolute spelling, hence the double slash.
    expect(sessionFileAddress('sess-1', '/Users/you/docs/design/orders-tab.md'))
      .toBe('dsh-resource://file/session/sess-1//Users/you/docs/design/orders-tab.md')
    // Every segment is encoded: spaces and Chinese both travel safely.
    expect(sessionFileAddress('sess-1', '/Users/you/my docs/中文 方案.md'))
      .toBe('dsh-resource://file/session/sess-1//Users/you/my%20docs/%E4%B8%AD%E6%96%87%20%E6%96%B9%E6%A1%88.md')
    // `%3A` is restored to `:` — the same readability rule the official helper has.
    expect(sessionFileAddress('sess-1', '/tmp/a:b.md')).toBe('dsh-resource://file/session/sess-1//tmp/a:b.md')
    // Backslashes are normalized and a leading `./` is dropped.
    expect(sessionFileAddress('sess-1', '.\\docs\\a.md')).toBe('dsh-resource://file/session/sess-1/docs/a.md')
    // A workspace-relative path keeps one slash.
    expect(sessionFileAddress('sess-1', 'docs/a.md')).toBe('dsh-resource://file/session/sess-1/docs/a.md')
  })

  test('opens a file through the sidebar service instead of reading it', () => {
    const { openInDsh } = helper()
    const opened = []
    const sidebar = { openResource: (address) => opened.push(address) }
    expect(openInDsh(sidebar, 'sess-1', '/Users/you/a b.md')).toBe(true)
    expect(opened).toEqual(['dsh-resource://file/session/sess-1//Users/you/a%20b.md'])
    // No service, no session or no absolute path: a refusal, never a throw.
    expect(openInDsh(undefined, 'sess-1', '/tmp/a.md')).toBe(false)
    expect(openInDsh({}, 'sess-1', '/tmp/a.md')).toBe(false)
    expect(openInDsh(sidebar, '', '/tmp/a.md')).toBe(false)
    expect(openInDsh(sidebar, 'sess-1', '')).toBe(false)
    // A mounted service can throw when no Session surface exists; the helper
    // must still return false so the caller can show a visible error.
    expect(openInDsh({ openResource: () => { throw new Error('no session surface') } }, 'sess-1', '/tmp/a.md')).toBe(false)
    expect(opened).toHaveLength(1)
  })

  test('builds one stage request shape for every way a stage can move', () => {
    const { stageRequest } = helper()
    expect(stageRequest('wo-20261115-3', 'review')).toEqual({
      path: '/hyper-org/api/order/wo-20261115-3',
      method: 'PATCH',
      body: { stage: 'review' },
    })
    // A drop carries the note `update` already requires; an empty one adds nothing.
    expect(stageRequest('wo-20261115-3', 'dropped', '  不做了  ').body).toEqual({ stage: 'dropped', note: '  不做了  ' })
    expect(stageRequest('wo-20261115-3', 'dropped', '   ').body).toEqual({ stage: 'dropped' })
  })

  test('groups five columns, keeps dropped folded, and marks display-only warnings', () => {
    const helpers = helper()
    const columns = helpers.columnsOf(boardState.orders)
    expect(columns.map((column) => column.stage)).toEqual(['intake', 'active', 'review', 'blocked', 'done'])
    expect(columns.map((column) => column.rows.length)).toEqual([1, 1, 1, 0, 1])
    // Dropped never disappears from the board, it moves to the folded strip.
    expect(helpers.archiveOf(boardState.orders).map((row) => row.id)).toEqual(['wo-20261116-2'])
    // A review card past 72h is overdue; a done or draft card is not.
    expect(helpers.overdueOf(boardState.orders, boardState.now).map((row) => row.id)).toEqual(['wo-20261115-3'])
    expect(helpers.noAcceptanceOf(boardState.orders).map((row) => row.id)).toEqual(['wo-20261114-4'])
    expect(helpers.pickFirst(boardState.orders)).toBe('wo-20261115-3')
    expect(helpers.pickFirst([])).toBeNull()
    expect(helpers.formatLogTime('2026-11-15T09:30:00.000Z')).toBe('11-15 09:30')
    expect(helpers.formatLogTime('')).toBe('—')
    expect(helpers.kindKey('file')).toBe('artifactFile')
    expect(helpers.kindKey('dir')).toBe('artifactDir')
    expect(helpers.kindKey('escape')).toBe('artifactEscape')
    expect(helpers.kindKey('missing')).toBe('artifactMissing')
  })

  test('mounts five columns, the fixed inspector and the DSH preview button', async () => {
    const mounted = loadClient()
    const seen = []
    recordFetch(seen)

    const tree = await mount(mounted)
    expect(tree.type).toBe('div')
    expect(tree.props.className).toBe('ho-root')
    expect(textOf(tree)).toContain('工单')
    expect(tree.children.some((child) => child && child.type === 'style')).toBe(true)

    // Five fixed columns, in stage order; dropped is a folded strip.
    const columns = findAll(tree, (node) => node.type === 'section' && node.props['data-stage'] !== undefined)
    expect(columns.map((node) => node.props['data-stage'])).toEqual(['intake', 'active', 'review', 'blocked', 'done'])
    const counts = findAll(tree, (node) => String(node.props.className || '').includes('ho-col-count'))
      .map((node) => textOf(node))
    expect(counts).toEqual(['1', '1', '1', '0', '1'])
    // The done column is a read-only entry: sign only.
    expect(textOf(columns[4])).toContain('只能由签收进入')
    expect(textOf(columns[4])).toContain('已签收')
    // The folded archive keeps the cancelled order reachable.
    expect(textOf(tree)).toContain('dropped · 1')

    const text = textOf(tree)
    // Top bar: one WIP reading, an overdue count and a missing-criteria count.
    expect(text).toContain('在制')
    expect(text).toContain('2/2')
    expect(text).toContain('超龄')
    expect(text).toContain('无验收')
    // The inspector is fixed beside the board, not a drawer.
    expect(find(tree, (node) => node.props['data-checker'] === 'open')).toBeDefined()
    expect(text).toContain('详情检查器')
    for (const label of ['当前阶段', '规模', '领取人（DRI）', '验收标准', '交付物', '完整日志']) {
      expect(text).toContain(label)
    }
    expect(text).toContain('五列都在')
    expect(text).toContain('实现落盘')

    // The deliverable exposes the exact address it will open, and clicking it
    // calls the sidebar service — nothing is read through the Host.
    const artifact = find(tree, (node) => String(node.props.className || '') === 'ho-art-open')
    expect(artifact).toBeDefined()
    expect(artifact.props['data-address'])
      .toBe('dsh-resource://file/session/sess-1//tmp/project/docs/design/orders-tab.md')
    expect(artifact.props.disabled).toBe(false)
    expect(textOf(tree)).toContain('在 DSH 预览中打开')
    artifact.props.onClick()
    expect(mounted.sidebarCalls).toEqual(['dsh-resource://file/session/sess-1//tmp/project/docs/design/orders-tab.md'])

    // No self-drawn preview survives, and no route reads file contents.
    expect(find(tree, (node) => String(node.props.className || '').includes('ho-pre'))).toBeUndefined()
    expect(find(tree, (node) => node.type === 'pre')).toBeUndefined()
    expect(seen.filter((entry) => entry.url.includes('/artifact'))).toEqual([])
  })

  test('explains a missing preview service instead of failing silently', async () => {
    const mounted = loadClient({ sidebar: 'missing' })
    recordFetch([])
    const tree = await mount(mounted)
    const artifact = find(tree, (node) => String(node.props.className || '') === 'ho-art-open')
    expect(artifact.props.disabled).toBe(true)
    expect(textOf(tree)).toContain('当前界面没有 DSH 文档预览服务')
  })

  test('a drop and the stage menu send the very same request', async () => {
    // Drag path: a card from review dropped on the active column.
    const dragged = loadClient()
    const dropSeen = []
    recordFetch(dropSeen)
    const tree = await mount(dragged)
    const card = find(tree, (node) => node.props['data-order-id'] === 'wo-20261115-3')
    const target = find(tree, (node) => node.props['data-stage'] === 'active')
    const dataTransfer = { getData: () => 'wo-20261115-3', setData() {} }
    const beforeDrop = dropSeen.length
    card.props.onDragStart({ dataTransfer, preventDefault() {} })
    target.props.onDrop({ dataTransfer, preventDefault() {} })
    await settle()
    const afterDrop = dropSeen.slice(beforeDrop)
    const dropped = afterDrop.find((entry) => entry.method === 'PATCH')
    expect(dropped.url).toBe('/hyper-org/api/order/wo-20261115-3?session=sess-1')
    expect(dropped.body).toBe(JSON.stringify({ stage: 'active' }))
    // The stage is never changed locally: the panel re-reads the board and the
    // order from disk after the write (success or refusal alike).
    expect(afterDrop.some((entry) => entry.method === 'GET' && entry.url.includes('/state'))).toBe(true)
    expect(afterDrop.some((entry) => entry.method === 'GET'
      && entry.url.includes('/order?')
      && entry.url.includes('wo-20261115-3'))).toBe(true)

    // Menu path: the same move chosen in the inspector's stage select.
    const selected = loadClient()
    const selectSeen = []
    recordFetch(selectSeen)
    const menuTree = await mount(selected)
    const select = find(menuTree, (node) => node.props['data-stage-select'] === 'true')
    // done stays selectable: the Host, not the panel, refuses that move.
    const doneOption = find(select, (node) => node.type === 'option' && node.props.value === 'done')
    expect(doneOption).toBeDefined()
    expect(doneOption.props.disabled).toBeUndefined()
    select.props.onChange({ target: { value: 'active' } })
    await settle()
    const menu = selectSeen.find((entry) => entry.method === 'PATCH')
    expect(menu.url).toBe(dropped.url)
    expect(menu.body).toBe(dropped.body)

    // Both are literally the helper's request, i.e. the Agent's update route.
    const { stageRequest } = selected.app.__test
    expect(stageRequest('wo-20261115-3', 'active')).toEqual({
      path: '/hyper-org/api/order/wo-20261115-3',
      method: 'PATCH',
      body: { stage: 'active' },
    })
    // done is not pre-blocked either: the same request goes out and the Host refuses it.
    expect(stageRequest('wo-20261115-3', 'done')).toEqual({
      path: '/hyper-org/api/order/wo-20261115-3',
      method: 'PATCH',
      body: { stage: 'done' },
    })
  })

  test('refuses to send a drop without a reason, then sends the same PATCH', async () => {
    const mounted = loadClient()
    const seen = []
    recordFetch(seen)
    const first = await mount(mounted)
    const archive = find(first, (node) => node.props['data-drop'] === 'dropped')
    expect(archive).toBeDefined()

    // Dropping onto the folded strip asks for the reason update already needs.
    archive.props.onDrop({ dataTransfer: { getData: () => 'wo-20261115-2' }, preventDefault() {} })
    await settle()
    expect(seen.filter((entry) => entry.method === 'PATCH')).toEqual([])

    const hooks = mounted.hooks
    const renderAgain = () => {
      hooks.begin()
      const tree = mounted.components.panel({ sessionId: 'sess-1' })
      for (const effect of hooks.take()) {
        const cleanup = effect()
        if (typeof cleanup === 'function') cleanup()
      }
      return expand(tree)
    }
    const withDialog = renderAgain()
    const dialog = find(withDialog, (node) => node.props.className === 'ho-modal')
    expect(dialog).toBeDefined()
    const confirm = find(dialog, (node) => node.type === 'button' && textOf(node) === '确认撤单')
    expect(confirm.props.disabled).toBe(true)

    const reason = find(dialog, (node) => node.type === 'textarea')
    reason.props.onChange({ target: { value: '不做了' } })
    const ready = renderAgain()
    const armed = find(ready, (node) => node.type === 'button' && textOf(node) === '确认撤单')
    expect(armed.props.disabled).toBe(false)
    armed.props.onClick()
    await settle()

    const patch = seen.find((entry) => entry.method === 'PATCH')
    expect(patch.url).toBe('/hyper-org/api/order/wo-20261115-2?session=sess-1')
    expect(JSON.parse(patch.body)).toEqual({ stage: 'dropped', note: '不做了' })
  })

  test('does not fetch without a session and explains why', async () => {
    const seen = []
    globalThis.fetch = async (url) => {
      seen.push(String(url))
      return { ok: true, status: 200, json: async () => ({}) }
    }
    const mounted = loadClient()
    mounted.hooks.begin()
    const tree = mounted.components.panel({ sessionId: '' })
    for (const effect of mounted.hooks.take()) effect()
    await settle()
    expect(seen).toEqual([])
    expect(textOf(expand(tree))).toContain('没有会话上下文')
  })
})
