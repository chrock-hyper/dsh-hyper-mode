/**
 * The panel is a hand-written browser module with no build step, so the
 * contract worth testing is: the module registers under the nested package
 * name, the tab lands in `conversation.view` beside 岗位 (50) and Wiki (60), the
 * display helpers behave, and one real mount of the component renders without
 * throwing — against the payloads `/hyper-org/api` actually returns.
 */
import { describe, expect, test } from 'bun:test'

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
  for (let index = 0; index < 5; index += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

const boardState = {
  ok: true,
  projectRoot: '/tmp/project',
  globalDir: '/tmp/home/org',
  projectDir: '/tmp/project/.dsh/org',
  wipLimit: 2,
  actor: { role: 'engineer', label: 'engineer', confirmed: true },
  stages: ['intake', 'active', 'review', 'blocked', 'done', 'dropped'],
  sizes: ['S', 'M', 'L'],
  occupied: 2,
  orders: [
    {
      id: 'wo-20261115-2', title: '看板那单', stage: 'active', size: 'M', dri: 'engineer',
      driTitle: '工程师', scope: 'project', age: '6 小时', updatedAt: '2026-11-15T09:30:00.000Z',
    },
    {
      id: 'wo-20261115-3', title: '待验收那单', stage: 'review', size: 'S', dri: 'reviewer',
      driTitle: '验收评审员', scope: 'project', age: '2 天', updatedAt: '2026-11-13T09:30:00.000Z',
    },
  ],
  roles: [{ id: 'engineer', title: '工程师', scope: 'project' }],
  problems: [],
}

const orderDoc = {
  ok: true,
  scope: 'project',
  path: '/tmp/project/.dsh/org/orders/wo-20261115-2.json',
  order: {
    schemaVersion: 1,
    id: 'wo-20261115-2',
    title: '看板那单',
    stage: 'active',
    size: 'M',
    dri: 'engineer',
    acceptance: ['六项都能看到', '门禁只有一套'],
    artifacts: ['out/report.md'],
    log: [
      { at: '2026-11-15T08:00:00.000Z', by: 'architect', note: '方案定稿' },
      { at: '2026-11-15T09:30:00.000Z', by: 'engineer', note: '实现落盘' },
    ],
    createdAt: '2026-11-15T08:00:00.000Z',
    updatedAt: '2026-11-15T09:30:00.000Z',
  },
  driTitle: '工程师',
  age: '6 小时',
  artifacts: [{ path: 'out/report.md', kind: 'file', bytes: 12 }],
  sign: {
    allowed: false,
    blockers: [{ code: 'not_review', message: '工单 wo-20261115-2 现在是 active，只有 review 状态可以签收' }],
  },
}

/** Load the module and register it against a fake client context. */
function loadClient() {
  const hooks = createHooks()
  const React = createReact(hooks)
  let registration
  globalThis.window = { __ModuleLoader__: { load: (entry) => { registration = entry } } }
  // eslint-disable-next-line no-undef
  require(new URL('../client/client.js', import.meta.url).pathname)
  if (registration === undefined) throw new Error('client module did not register a factory')
  const app = registration.factory((name) => {
    if (name === 'react') return React
    throw new Error(`unexpected require: ${name}`)
  })

  const calls = []
  const components = {}
  const dictionaries = {}
  const ctx = {
    effect(factory, label) {
      calls.push(['effect', label])
      return factory()
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
      register(options, component) {
        calls.push(['register', options.name, options])
        components.panel = component
        return () => {}
      },
    },
  }
  app.apply(ctx)
  return { registration, app, hooks, calls, components }
}

/**
 * Expand function components into host elements, the way React would before
 * committing: the props of a component (a label, say) are not children.
 * @param node - rendered tree.
 * @returns the host-element tree.
 */
function expand(node) {
  if (node === null || node === undefined) return null
  if (Array.isArray(node)) return node.map(expand).filter((child) => child !== null)
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  const { type, props, children } = node
  if (typeof type === 'function') {
    return expand(type({ ...props, children: children.length === 1 ? children[0] : children }))
  }
  return {
    type,
    props,
    children: children.map(expand).filter((child) => child !== null),
  }
}

/** @param {object} node - rendered tree. @returns all text, flattened. */
function textOf(node) {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  return (node.children || []).map(textOf).join(' ')
}

/** @param {object} node - tree root. @param {(node: object) => void} visit - per element. */
function walk(node, visit) {
  if (node === null || node === undefined || typeof node === 'string') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  visit(node)
  walk(node.children, visit)
}

describe('client module', () => {
  const client = loadClient()

  test('registers one lazy factory under the nested package name', () => {
    expect(client.registration.id).toBe('@chrock-studio/dsh-hyper-org')
    expect(typeof client.registration.factory).toBe('function')
  })

  test('declares its client services and the fourth conversation tab', () => {
    const { calls } = client
    expect(client.app.inject).toEqual(['slots', 'locale'])
    expect(calls[0]).toEqual(['effect', 'hyper-org: dictionaries'])

    const locale = calls.find((row) => row[0] === 'locale')
    expect(locale[1]).toBe('hyperOrg')
    expect(locale[2]).toEqual(['en', 'zh'])

    expect(calls.filter((row) => row[0] === 'inject').map((row) => row[1])).toEqual(['conversation.view'])

    const tab = calls.find((row) => row[0] === 'register' && row[1] === 'conversation.view')
    expect(tab[2].id).toBe('orders')
    // 岗位 50 / Wiki 60 — 70 keeps this tab to their right instead of colliding.
    expect(tab[2].order).toBe(70)
    expect(tab[2].locale).toBe('hyperOrg')
    expect(tab[2].label()).toBe('工单')
    expect(typeof client.components.panel).toBe('function')
  })

  test('exposes the display helpers for direct checks', () => {
    const helpers = client.app.__test

    expect(helpers.queryString({ session: 's1', id: undefined, path: '' })).toBe('?session=s1')
    expect(helpers.queryString({})).toBe('')

    const groups = helpers.groupByStage(
      [
        { id: 'b', stage: 'active', updatedAt: '2026-11-15T10:00:00.000Z' },
        { id: 'a', stage: 'active', updatedAt: '2026-11-14T10:00:00.000Z' },
        { id: 'd', stage: 'done', updatedAt: '2026-11-13T10:00:00.000Z' },
        { id: 'x', stage: 'elsewhere', updatedAt: '2026-11-13T10:00:00.000Z' },
      ],
      ['intake', 'active', 'review', 'blocked', 'done'],
    )
    expect(groups.map((group) => group.stage)).toEqual(['intake', 'active', 'review', 'blocked', 'done', 'dropped'])
    // Oldest first inside a group: aging is what the column is for.
    expect(groups[1].rows.map((row) => row.id)).toEqual(['a', 'b'])
    expect(groups[5].rows).toEqual([])

    expect(helpers.formatLogTime('2026-11-15T09:30:00.000Z')).toBe('11-15 09:30')
    expect(helpers.formatLogTime('')).toBe('—')

    expect(helpers.kindKey('file')).toBe('artifactFile')
    expect(helpers.kindKey('dir')).toBe('artifactDir')
    expect(helpers.kindKey('escape')).toBe('artifactEscape')
    expect(helpers.kindKey('missing')).toBe('artifactMissing')

    // The detail column opens on something that needs a decision first.
    expect(helpers.pickFirst(boardState.orders)).toBe('wo-20261115-3')
    expect(helpers.pickFirst([])).toBeNull()
  })

  test('mounts, loads the board and renders the six detail items', async () => {
    globalThis.fetch = async (url) => ({
      ok: true,
      status: 200,
      json: async () => (String(url).includes('/state') ? boardState : orderDoc),
    })

    const props = { sessionId: 'sess-1' }
    const render = async () => {
      client.hooks.begin()
      const tree = client.components.panel(props)
      const effects = client.hooks.take()
      for (const effect of effects) {
        const cleanup = effect()
        if (typeof cleanup === 'function') cleanup()
      }
      await settle()
      return tree
    }

    const first = await render()
    expect(first.type).toBe('div')
    expect(first.props.className).toBe('ho-root')
    expect(textOf(expand(first))).toContain('从左选一张工单')
    expect(first.children.some((child) => child && child.type === 'style')).toBe(true)

    // Effects ran: the board arrives, then the auto-selected order.
    const second = await render()
    const third = await render()
    const expanded = expand(third)
    const text = textOf(expanded)
    expect(text).toContain('看板那单')
    expect(text).toContain('active')
    expect(text).toContain('工程师')
    expect(text).toContain('六项都能看到')
    expect(text).toContain('完整日志')
    expect(text).toContain('out/report.md')
    expect(text).toContain('方案定稿')
    expect(text).toContain('2/2')
    // Stage groups are present in the Host's order, dropped included.
    const headers = []
    walk(expanded, (node) => {
      if (String(node.props.className || '') === 'ho-group-head') headers.push(textOf(node).trim())
    })
    expect(headers.map((entry) => entry.replace(/^[▾▸]\s*/, '').split(' (')[0]))
      .toEqual(['intake', 'active', 'review', 'blocked', 'done', 'dropped'])
  })

  test('does not fetch without a session and explains why', async () => {
    const seen = []
    globalThis.fetch = async (url) => {
      seen.push(String(url))
      return { ok: true, status: 200, json: async () => ({}) }
    }
    client.hooks.begin()
    const tree = client.components.panel({ sessionId: '' })
    for (const effect of client.hooks.take()) effect()
    await settle()
    expect(seen).toEqual([])
    expect(textOf(expand(tree))).toContain('没有会话上下文')
  })
})
