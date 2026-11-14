/**
 * The panel is a hand-written browser module with no build step, so the module
 * format and the slot registrations are the contract worth testing: a wrong
 * slot key or a missing `./client` id blanks the panel with only a console
 * line. Rendering itself needs the Host's React, which a unit test cannot have.
 */
import { describe, expect, test } from 'bun:test'

const loaded = []
globalThis.window = {
  __ModuleLoader__: {
    load: (registration) => loaded.push(registration),
  },
}

const React = {
  createElement: () => null,
  useCallback: (fn) => fn,
  useEffect: () => {},
  useMemo: (fn) => fn(),
  useState: (initial) => [initial, () => {}],
}

await import('../client/client.js')

describe('client module', () => {
  test('registers one factory under the package name', () => {
    expect(loaded.length).toBe(1)
    expect(loaded[0].id).toBe('@chrock-studio/dsh-hyper-roles')
    expect(typeof loaded[0].factory).toBe('function')
  })

  test('registers the locale and the conversation tab', () => {
    const plugin = loaded[0].factory((specifier) => {
      expect(specifier).toBe('react')
      return React
    })
    expect(plugin.inject).toEqual(['slots', 'locale'])

    const registrations = []
    const ctx = {
      effect: (factory) => factory(),
      locale: {
        register: (ns, dictionaries) => {
          registrations.push({ kind: 'locale', ns, dictionaries })
          return () => {}
        },
        bind: (ns) => (key) => `${ns}.${key}`,
      },
      slots: {
        inject: (_name, factory) => factory(),
        register: (options, component) => {
          registrations.push({ kind: 'slot', options, component })
          return () => {}
        },
      },
    }
    plugin.apply(ctx)

    const locale = registrations.find((entry) => entry.kind === 'locale')
    expect(locale.ns).toBe('hyperRoles')
    expect(locale.dictionaries.zh.tab).toBe('岗位')
    expect(locale.dictionaries.en.tab).toBe('Roles')

    const slots = registrations.filter((entry) => entry.kind === 'slot')
    expect(slots.map((entry) => entry.options.name)).toEqual(['conversation.view'])

    const tab = slots[0]
    expect(tab.options.id).toBe('roles')
    expect(tab.options.order).toBe(50)
    expect(typeof tab.component).toBe('function')
  })
})
