/**
 * The panel is a bundled browser module: the build wraps the emitted CJS chunk
 * in one `window.__ModuleLoader__.load({ id, factory })` registration, and the
 * factory renders with React from the page's module table. This harness stubs
 * both, so the factory, the slot registrations, the request the panel makes on
 * mount, and one render of the tab are exercised without a browser.
 *
 * It loads the build output (`lib/client.js`), not the source, because that file
 * is what the page actually receives: the module format, the wrapper and the
 * JSX transform are part of the contract. The fake `require` therefore answers
 * the two externals the bundle keeps — `react` and `react/jsx-runtime`.
 */
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

/** A single-pass hook runtime: enough for a component that mounts once. */
function createHooks() {
  let cursor = 0
  const states = []
  const effects = []
  return {
    effects,
    reset() {
      cursor = 0
    },
    useState(initial) {
      const index = cursor
      cursor += 1
      if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial
      return [states[index], next => { states[index] = next }]
    },
    useMemo(factory) {
      cursor += 1
      return factory()
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

/**
 * A React stand-in that records the element tree.
 * @param hooks - the hook runtime to bind.
 * @returns the module the bundle destructures `require('react')` into.
 */
function createReact(hooks) {
  const Fragment = Symbol('Fragment')
  const createElement = (type, props, ...children) => ({
    type,
    props: props || {},
    children: children.flat(Infinity).filter(child => child !== null && child !== false),
  })
  return {
    Fragment,
    createElement,
    useState: hooks.useState,
    useMemo: hooks.useMemo,
    useCallback: hooks.useCallback,
    useEffect: hooks.useEffect,
  }
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

// The page's module table: one factory per id, and a second registration for
// the same id is a hard error (a bundle must register exactly once).
const registrations = []
globalThis.window = {
  __ModuleLoader__: {
    load(registration) {
      if (registrations.some(entry => entry.id === registration.id)) {
        throw new Error(`duplicate factory registration for "${registration.id}"`)
      }
      registrations.push(registration)
    },
  },
}

await import(pathToFileURL(join(import.meta.dir, '../lib/client.js')).href)

/**
 * Run the bundle factory against the fake module table.
 * @returns the plugin object, the hook runtime, the externals it required, the
 *   registered dictionaries, and the slot registrations.
 */
function mount() {
  const hooks = createHooks()
  const React = createReact(hooks)
  const jsxRuntime = createJsxRuntime(React)
  const required = []
  const entries = []
  const dictionaries = {}
  const plugin = registrations[0].factory((specifier) => {
    required.push(specifier)
    if (specifier === 'react') return React
    if (specifier === 'react/jsx-runtime') return jsxRuntime
    throw new Error(`unexpected require: ${specifier}`)
  })

  const ctx = {
    effect: factory => factory(),
    locale: {
      register(namespace, value) {
        dictionaries[namespace] = value
        return () => {}
      },
      bind: namespace => (key) => {
        const zh = (dictionaries[namespace] || {}).zh || {}
        return zh[key] === undefined ? key : zh[key]
      },
    },
    slots: {
      inject: (_owner, factory) => factory(),
      register(options, component) {
        entries.push({ options, component })
        return () => {}
      },
    },
  }
  plugin.apply(ctx)
  return { plugin, hooks, required, entries, dictionaries }
}

/**
 * Render the registered tab once.
 * @param client - the mounted bundle.
 * @returns the recorded element tree.
 */
function renderTab(client) {
  const entry = client.entries.find(item => item.options.name === 'conversation.view')
  if (entry === undefined) throw new Error('no conversation.view registration')
  client.hooks.reset()
  return entry.component({ sessionId: 'session-1' })
}

/**
 * Resolve every function component in a recorded tree.
 * @param node - element, string, array, or nothing.
 * @returns the same tree with only host elements left.
 */
function tree(node) {
  if (node === null || node === undefined || node === true || node === false) return null
  if (Array.isArray(node)) return node.map(tree).filter(child => child !== null)
  if (typeof node === 'string' || typeof node === 'number') return node
  if (typeof node.type === 'function') {
    const { children, ...props } = node.props
    const merged = { ...props, children: node.children.length === 1 ? node.children[0] : node.children }
    return tree(node.type(merged))
  }
  return { type: node.type, props: node.props, children: node.children.map(tree).filter(child => child !== null) }
}

/** @param node - a resolved tree. @returns every text node joined. */
function textOf(node) {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  return textOf(node.children)
}

/**
 * Read the stylesheet from the source that the panel inlines.
 * @returns the CSS text between the template literal fences.
 */
function stylesFromSource() {
  const source = readFileSync(new URL('../src/client/styles.ts', import.meta.url), 'utf8')
  const block = /export const STYLES = `([\s\S]*?)`\n/.exec(source)
  if (block === null) throw new Error('no STYLES block in src/client/styles.ts')
  return block[1]
}

describe('client module', () => {
  test('registers one factory under the package name', () => {
    expect(registrations.length).toBe(1)
    expect(registrations[0].id).toBe('@chrock-hyper/dsh-hyper-roles')
    expect(typeof registrations[0].factory).toBe('function')
  })

  test('requires only the page baseline modules', () => {
    const client = mount()
    expect(client.required).toEqual(['react', 'react/jsx-runtime'])
  })

  test('registers the locale and the conversation tab', () => {
    const client = mount()
    expect(client.plugin.inject).toEqual(['slots', 'locale'])

    const locale = client.dictionaries.hyperRoles
    expect(locale.zh.tab).toBe('岗位')
    expect(locale.en.tab).toBe('Roles')

    expect(client.entries.map(entry => entry.options.name)).toEqual(['conversation.view'])
    const tab = client.entries[0]
    expect(tab.options.id).toBe('roles')
    expect(tab.options.order).toBe(50)
    expect(typeof tab.component).toBe('function')
  })

  test('renders the stylesheet and the three columns', () => {
    const client = mount()
    const rendered = tree(renderTab(client))

    expect(rendered.type).toBe('div')
    expect(rendered.props.className).toBe('hr-tab')

    const style = rendered.children.find(child => child.type === 'style')
    expect(style.children.join('')).toBe(stylesFromSource())

    const body = rendered.children.find(child => child.props.className === 'hr-body-cols')
    expect(body.children.map(child => child.props.className)).toEqual([
      'hr-col hr-list-col',
      'hr-col hr-editor-col',
      'hr-col hr-side-col',
    ])
    // Nothing is loaded yet: the left column says so instead of rendering rows.
    expect(textOf(rendered)).toContain('读取中…')
  })

  test('loads its state from the panel route with the session id', async () => {
    const client = mount()
    const urls = []
    const previous = globalThis.fetch
    globalThis.fetch = async (url) => {
      urls.push(String(url))
      return {
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          projectDir: null,
          globalDir: '/tmp/roles',
          roles: { project: [], global: [] },
          problems: [],
          builtins: [],
        }),
      }
    }
    try {
      renderTab(client)
      for (const effect of client.hooks.effects) effect()
      await new Promise((done) => setTimeout(done, 0))
    } finally {
      globalThis.fetch = previous
    }
    expect(urls[0]).toBe('/hyper-roles/api/state?session=session-1')
  })

  test('exposes the pure helpers through __test', () => {
    const { queryString, formOf, parseList } = mount().plugin.__test

    expect(queryString({ session: 's1', cwd: '', scope: null })).toBe('?session=s1')
    expect(queryString({})).toBe('')
    expect(formOf({ title: 'A', capabilities: ['x'] }, 'body')).toEqual({
      title: 'A',
      capabilities: ['x'],
      skills: [],
      handoffs: [],
      can: [],
      model: '',
      body: 'body',
    })
    expect(parseList(' a, b，c ,, ')).toEqual(['a', 'b', 'c'])
  })
})
