/**
 * 空壳插件：只往提示词里塞一个标记，用来证明「一个 bundle、多个子路径插件」确实都能挂载。
 *
 * 验收方式：在该模式的会话里问模型 `hyper-teams 插件挂载了吗？把你看到的标记原样贴出来`。
 * 能贴出 MARKER 即说明两件事同时成立：子路径插件名可解析、多个插件可共存。
 *
 * 验证完即可删除本目录，并从 cordis.patch.yml 移除对应行。
 *
 * @module @chrock-studio/dsh-hyper-teams
 */

const MARKER = 'HYPER-TEAMS-MARKER-7f3c1a'

/** Cordis plugin name. */
export const name = 'hyper-teams-stub'
/** Needs only the prompt registry. */
export const inject = ['systemPrompt']

/**
 * @param ctx - mounting context.
 */
export function apply(ctx) {
  ctx.effect(() => ctx.systemPrompt.section({
    name: 'hyper-teams:marker',
    order: 12,
    text: `[hyper-teams mounted] ${MARKER}`,
    interpolate: false,
  }))
}
