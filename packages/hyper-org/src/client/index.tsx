/**
 * Orders tab — browser half, entry point.
 *
 * The page keeps a lazy module table, and the build owns the one registration:
 * tsdown bundles this directory to CJS and wraps the chunk in
 * `window.__ModuleLoader__.load({ id: '@chrock-hyper/dsh-hyper-org', factory(require) { … } })`,
 * where the id is this package's name and the factory returns `module.exports`.
 * So this file has no `load` call of its own — a second registration for the
 * same id is a hard error in the table — and it exports exactly the plugin
 * object the composition expects: `{ inject, __test, apply }`.
 *
 * `react` and `react/jsx-runtime` stay external and resolve through the
 * factory's `require`, so the page owns the single React copy. The board's own
 * rules (drag/drop is one PATCH, failures land on the banner, `dsh-resource://`
 * addresses go to DSH's sidebar) live in `./panel.tsx`; this file owns the
 * plugin contract.
 */
import { openInDsh, sessionFileAddress } from './address.ts'
import { queryString, stageRequest } from './api.ts'
import {
  archiveOf,
  columnsOf,
  formatLogTime,
  hoursSince,
  kindKey,
  noAcceptanceOf,
  overdueOf,
  pickFirst,
} from './format.ts'
import { bindTranslate, en, NS, TAB_ID, t, zh } from './locale.ts'
import { bindServices, OrdersTab } from './panel.tsx'

/** What the slot service stores for one conversation view. */
interface SlotRegistration {
  name: string
  id: string
  order: number
  locale: string
  label: () => string
}

/**
 * The Cordis services this plugin touches.
 *
 * Declared here rather than imported from the Host: a browser module cannot
 * import the Host half, and only these members are used.
 */
interface PluginContext {
  effect(factory: () => unknown, label: string): unknown
  get(name: string): unknown
  locale: {
    register(namespace: string, dictionaries: Record<string, Record<string, string>>): unknown
    bind(namespace: string): (key: string) => string
  }
  slots: {
    inject(owner: string, factory: () => unknown): unknown
    register(options: SlotRegistration, component: typeof OrdersTab): unknown
  }
}

/** Services this plugin requires; the composition provides them. */
export const inject = ['slots', 'locale']

/**
 * Test-only handles: the module loader ignores extra keys, so the pure helpers
 * behind the board can be exercised without mounting it.
 */
export const __test = {
  queryString,
  sessionFileAddress,
  openInDsh,
  stageRequest,
  columnsOf,
  archiveOf,
  overdueOf,
  noAcceptanceOf,
  hoursSince,
  pickFirst,
  formatLogTime,
  kindKey,
}

/**
 * Register the locale dictionaries and the conversation tab.
 * @param ctx - the Client context with the slot and locale services.
 */
export function apply(ctx: PluginContext): void {
  bindServices(ctx)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'hyper-org: dictionaries')
  bindTranslate(ctx.locale.bind(NS))

  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: TAB_ID,
    order: 70,
    locale: NS,
    label: () => t('tab'),
  }, OrdersTab))
}
