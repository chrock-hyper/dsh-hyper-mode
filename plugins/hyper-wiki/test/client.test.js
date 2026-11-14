import { describe, expect, test } from 'bun:test'

/**
 * The client half is a plain browser module: it registers a lazy factory with
 * `window.__ModuleLoader__` and renders with React from the platform module
 * table. This harness stubs both, so the factory, the slot registrations, and
 * one mount of each component are exercised without a browser or a build step.
 */

/** A single-pass hook runtime: enough for a component that mounts once. */
function createHooks() {
  let cursor = 0
  const states = []
  const refs = []
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
    useRef(initial) {
      const index = cursor
      cursor += 1
      if (!(index in refs)) refs[index] = { current: initial }
      return refs[index]
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
 * @returns the module table entry the client destructures.
 */
function createReact(hooks) {
  const Fragment = Symbol('Fragment')
  return {
    Fragment,
    createElement(type, props, ...children) {
      return {
        type,
        props: props || {},
        children: children.flat(Infinity).filter(child => child !== null && child !== false),
      }
    },
    useState: hooks.useState,
    useMemo: hooks.useMemo,
    useCallback: hooks.useCallback,
    useRef: hooks.useRef,
    useEffect: hooks.useEffect,
  }
}

/**
 * Load the client module and return its registration plus a mounted app.
 * @returns the registration, the fake React runtime, and the captured slots.
 */
function loadClient() {
  const hooks = createHooks()
  const React = createReact(hooks)
  let registration
  globalThis.window = {
    __ModuleLoader__: {
      load(entry) {
        registration = entry
      },
    },
  }
  // eslint-disable-next-line no-undef
  require(new URL('../client/client.js', import.meta.url).pathname)
  if (registration === undefined) throw new Error('client module did not register a factory')
  const app = registration.factory(name => {
    if (name === 'react') return React
    throw new Error(`unexpected require: ${name}`)
  })

  const calls = []
  const components = {}
  const ctx = {
    effect(factory, label) {
      calls.push(['effect', label])
      return factory()
    },
    locale: {
      register(namespace, dictionaries) {
        calls.push(['locale', namespace, Object.keys(dictionaries).sort()])
        return () => {}
      },
      bind: () => key => key,
    },
    slots: {
      inject(owner, factory) {
        calls.push(['inject', owner])
        return factory()
      },
      register(options, component) {
        calls.push(['register', options.name, options])
        // The tab is the only component now; name it by role for the mounts below.
        components[options.name === 'conversation.view' ? 'panel' : 'icon'] = component
        return () => {}
      },
    },
  }
  app.apply(ctx)
  return { registration, app, hooks, calls, components }
}

/**
 * Collect every string in a rendered tree.
 * @param node - an element, a string, or an array of them.
 * @returns the joined text.
 */
function textOf(node) {
  if (node === null || node === undefined) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(textOf).join(' ')
  return (node.children || []).map(textOf).join(' ')
}

/**
 * Walk a rendered tree.
 * @param node - tree root.
 * @param visit - callback per element.
 */
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

  test('registers a lazy factory under the package name', () => {
    expect(client.registration.id).toBe('@chrock-studio/dsh-hyper-wiki-client')
    expect(typeof client.registration.factory).toBe('function')
  })

  test('declares its client services and registers the conversation tab', () => {
    const { calls } = client
    expect(client.app.inject).toEqual(['slots', 'locale'])
    expect(calls[0]).toEqual(['effect', 'dsh-wiki: dictionaries'])

    const locale = calls.find(row => row[0] === 'locale')
    expect(locale[1]).toBe('wiki')
    expect(locale[2]).toEqual(['en', 'zh'])

    expect(calls.filter(row => row[0] === 'inject').map(row => row[1])).toEqual(['conversation.view'])

    const tab = calls.find(row => row[0] === 'register' && row[1] === 'conversation.view')
    expect(tab[2].id).toBe('wiki')
    expect(tab[2].order).toBe(60)
    expect(tab[2].locale).toBe('wiki')
    expect(typeof tab[2].label).toBe('function')
    expect(tab[2].label()).toBe('panel')
  })

  test('exposes the display helpers for direct checks', () => {
    const helpers = client.app.__test
    expect(typeof helpers.diffLines).toBe('function')

    expect(helpers.diffLines('a\nb\nc', 'a\nB\nc')).toBe(' a\n-b\n+B\n c')
    expect(helpers.diffLines('same', 'same')).toBe(' same')
    // An empty side still renders its one empty line, as a diff would.
    expect(helpers.diffLines('', 'plus')).toBe('-\n+plus')

    expect(helpers.stripFrontmatter('---\ntitle: x\n---\n\nbody')).toBe('body')
    expect(helpers.stripFrontmatter('# no frontmatter')).toBe('# no frontmatter')

    const blocks = helpers.renderPreview('# 标题\n\n段落\n\n- 列表\n\n> 引用\n\n```\ncode\n```')
    expect(blocks.map(block => block.type)).toEqual(['div', 'p', 'div', 'div', 'pre'])
    expect(blocks[0].props.className).toBe('dw-md-h dw-md-h1')
    expect(blocks[3].props.className).toBe('dw-md-quote')
  })

  test('mounts the main panel without throwing and offers the three tabs', () => {
    client.hooks.reset()
    const tree = client.components.panel({ sessionId: 'sess-1' })
    expect(tree.type).toBe('div')
    expect(tree.props.className).toBe('dw-root')
    const classes = []
    walk(tree, node => classes.push(String(node.props.className || '')))
    expect(classes.some(name => name.includes('dw-header'))).toBe(true)
    expect(classes.some(name => name.includes('dw-tree'))).toBe(true)
    expect(classes.some(name => name.includes('dw-rail'))).toBe(true)
    // A style element ships with the panel so unmounting removes the CSS.
    expect(tree.children.some(child => child && child.type === 'style')).toBe(true)
  })
})
