/**
 * Mounting side effects: the `/wiki` HTTP route and the bundled skill.
 *
 * Both wait for their service, because a composition may mount `webServer` or
 * `skills` after the wiki plugin. A service that never appears is a warning,
 * not a failure.
 *
 * @module @chrock-hyper/dsh-hyper-wiki/mount
 */
import type { HostContext, HttpHandler } from '@chrock-hyper/dsh-hyper-shared/host'

import { WIKI_ROUTE_PREFIX } from './api.ts'
import type { WikiLogger } from './host.ts'
import { readBundledSkill } from './skill.ts'

/**
 * Register the `/wiki` route, waiting for `webServer` when it mounts later.
 * @param ctx - plugin context.
 * @param handler - request handler.
 * @param logger - resolved logger.
 */
export function mountRoutes(ctx: HostContext, handler: HttpHandler, logger: WikiLogger): void {
  const attach = (host: HostContext): void => {
    const server = host.get?.('webServer')
    if (server === undefined || server === null || typeof server.register !== 'function') return
    host.effect(
      () => server.register({ kind: 'prefix', path: WIKI_ROUTE_PREFIX, handler }),
      'dsh-wiki: /wiki routes',
    )
  }
  if (ctx.get?.('webServer') !== undefined) {
    attach(ctx)
    return
  }
  if (typeof ctx.inject === 'function') {
    ctx.inject(['webServer'], attach)
    return
  }
  logger.warn('dsh-wiki: webServer unavailable; the Wiki panel cannot load data')
}

/**
 * Register the bundled skill when the composition has a skill registry.
 * @param ctx - plugin context.
 * @param logger - resolved logger.
 */
export function registerBundledSkill(ctx: HostContext, logger: WikiLogger): void {
  const skill = readBundledSkill()
  if (skill === undefined) {
    logger.warn('dsh-wiki: skills/wiki-draft-review/SKILL.md is missing or malformed')
    return
  }
  const attach = (host: HostContext): void => {
    const skills = host.get?.('skills')
    if (skills === undefined || skills === null || typeof skills.register !== 'function') return
    host.effect(() => skills.register(skill), 'dsh-wiki: wiki-draft-review skill')
  }
  if (ctx.get?.('skills') !== undefined) {
    attach(ctx)
    return
  }
  if (typeof ctx.inject === 'function') ctx.inject(['skills'], attach)
}
