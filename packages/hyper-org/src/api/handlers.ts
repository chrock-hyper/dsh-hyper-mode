/**
 * The two read payloads the panel renders: the board summary and one order's
 * card.
 *
 * Pure assembly — directories in, JSON out. No route, no transport and no
 * writes: every gate they report is the one `rules.ts` and `store.ts` enforce.
 *
 * @module @chrock-studio/dsh-hyper-org/api/handlers
 */
import { listRoles, readRole } from '@chrock-studio/dsh-hyper-roles/internal'

import { artifactBase, describeArtifact } from '../artifacts.ts'
import { ageOf } from '../marker.ts'
import { occupiesSlot, SIZES, STAGES, WIP_STAGES } from '../order-doc.ts'
import { signBlockers } from '../rules.ts'
import type { LocatedOrder, OrderScope, OrgDirs, ScopeDirs } from '../store.ts'
import { listOrders } from '../store.ts'

/** What the route knows about the calling session. */
export interface SessionInfo {
  cwd: string | undefined
  role: string | undefined
  confirmed: boolean
}

/** The inputs `statePayload` reads. */
export interface StatePayloadContext {
  dirs: OrgDirs
  roleDirs: ScopeDirs
  session: SessionInfo
  actor: string
  wipLimit: number | undefined
}

/** The inputs `orderPayload` reads. */
export interface OrderPayloadContext {
  dirs: OrgDirs
  roleDirs: ScopeDirs
  role: string | undefined
}

/**
 * Assemble the board summary.
 * @param context - directories, session, actor and slot limit.
 * @returns the JSON payload the left column renders.
 */
export function statePayload(context: StatePayloadContext) {
  const { dirs, roleDirs, session, actor, wipLimit } = context
  const listed = listOrders(dirs)
  // Ids are per scope, so the same id can exist in both; the project copy is
  // the one `readOrder` resolves, so it must also own the label. Global first,
  // project second.
  const scopes = new Map<string, OrderScope>([
    ...listed.global.map((order): [string, OrderScope] => [order.id, 'global']),
    ...listed.project.map((order): [string, OrderScope] => [order.id, 'project']),
  ])
  const roleRows = listRoles(roleDirs)
  const titles = new Map<string, string>([
    ...roleRows.global.map((row): [string, string] => [row.id, row.title]),
    ...roleRows.project.map((row): [string, string] => [row.id, row.title]),
  ])
  return {
    ok: true,
    now: new Date().toISOString(),
    projectRoot: dirs.projectRoot ?? null,
    globalDir: dirs.globalDir,
    projectDir: dirs.projectDir ?? null,
    wipLimit,
    actor: { role: session.role ?? null, label: actor, confirmed: session.confirmed },
    stages: STAGES,
    wipStages: WIP_STAGES,
    sizes: SIZES,
    occupied: listed.merged.filter(occupiesSlot).length,
    orders: listed.merged.map((order) => ({
      id: order.id,
      title: order.title,
      stage: order.stage,
      size: order.size,
      dri: order.dri ?? null,
      driTitle: order.dri === undefined ? null : titles.get(order.dri) ?? null,
      scope: scopes.get(order.id) ?? 'project',
      age: ageOf(order.updatedAt),
      updatedAt: order.updatedAt,
      acceptanceCount: order.acceptance.length,
      artifactCount: order.artifacts.length,
      logCount: order.log.length,
      occupiesSlot: occupiesSlot(order),
    })),
    roles: [
      ...roleRows.project.map((row) => ({ id: row.id, title: row.title, scope: 'project' })),
      ...roleRows.global.filter((row) => row.shadowed !== true)
        .map((row) => ({ id: row.id, title: row.title, scope: 'global' })),
    ],
    problems: listed.problems,
  }
}

/**
 * Assemble one order's full card.
 *
 * The log is returned whole on purpose: the panel must show every entry, while
 * `marker.renderOrder` bounds what a model reads.
 * @param found - located order.
 * @param context - directories and the caller's real bound role.
 * @returns the JSON payload the detail column renders.
 */
export function orderPayload(found: LocatedOrder, context: OrderPayloadContext) {
  const { dirs, roleDirs, role } = context
  const base = artifactBase({ projectRoot: dirs.projectRoot })
  const blockers = signBlockers(found.order, { role })
  return {
    ok: true,
    scope: found.scope,
    path: found.path,
    order: found.order,
    driTitle: found.order.dri === undefined ? null : readRole(roleDirs, found.order.dri)?.fields?.title ?? null,
    age: ageOf(found.order.updatedAt),
    artifacts: found.order.artifacts.map((path) => describeArtifact(base, path)),
    sign: { allowed: blockers.length === 0, blockers },
  }
}
