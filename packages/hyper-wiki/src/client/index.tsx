/**
 * Wiki panel — browser half.
 *
 * A sidebar entry beside Plugins and Scheduled tasks, opening a review page:
 * page tree and search on the left, page source and a plain-text preview in the
 * middle, and the draft, backlinks, and approval controls on the right. The
 * Host owns every file operation; this module only calls `/wiki/*` and renders.
 *
 * Build contract: tsdown bundles this entry to CJS and wraps the whole chunk
 * in the page's one module-table registration — `__ModuleLoader__.load` with
 * the package name and a `factory` — and that factory returns this module's
 * exports, which is the plugin object. That is why this file has no `load`
 * call of its own: the wrapper owns the single registration, exactly like the
 * shipped `@deepseek-ai/*` clients. `react` and `react/jsx-runtime` stay
 * external and resolve through the factory's `require`, so the page's module
 * table owns the one React copy.
 */

import { diffLines, stripFrontmatter } from './diff.ts'
import { WikiIcon } from './icon.tsx'
import type { Translate } from './locale.ts'
import { bindTranslate, en, NS, t, zh } from './locale.ts'
import { renderPreview } from './markdown.tsx'
import { WikiPage } from './panel.tsx'

/** What `ctx.slots.register` accepts for a conversation view. */
interface SlotOptions {
  name: string
  id: string
  order: number
  label: () => string
  locale: string
}

/** The panel's slice of the Client context. */
interface WikiContext {
  effect(factory: () => unknown, label?: string): void
  locale: {
    register(namespace: string, dictionaries: Record<string, Record<string, string>>): () => void
    bind(namespace: string): Translate
  }
  slots: {
    inject(owner: string, factory: () => () => void): void
    register(options: SlotOptions, component: typeof WikiPage): () => void
  }
}

export const inject = ['slots', 'locale']

/**
 * Test-only handles: the module loader ignores extra keys, so the pure display
 * helpers can be exercised without mounting the panel.
 */
export const __test = { diffLines, renderPreview, stripFrontmatter, WikiIcon, WikiPage }

export function apply(ctx: WikiContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-wiki: dictionaries')
  bindTranslate(ctx.locale.bind(NS))

  ctx.slots.inject('conversation.view', () =>
    ctx.slots.register(
      {
        name: 'conversation.view',
        id: 'wiki',
        order: 60,
        label: () => t('panel'),
        locale: NS,
      },
      WikiPage,
    ),
  )
}
