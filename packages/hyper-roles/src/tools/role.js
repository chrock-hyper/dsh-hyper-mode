/**
 * The `role` tool: read your own card, list the catalog, load a declared skill,
 * record an experience entry, or read and write a role's reading guide.
 *
 * @module @chrock-studio/dsh-hyper-roles/tools/role
 */
import { clip, renderCard } from '../marker.js'
import { appendNote, readGuide, readRole, readRoleIn, writeGuide } from '../store.js'
import { catalogText, searchNotes } from './catalog.js'
import { TEXT_OUTPUT } from './context.js'

/**
 * Build the `role` tool definition.
 * @param rt - the shared tool context.
 * @returns the tool definition.
 */
export function createRoleTool(rt) {
  const { ctx, config, packageRoot, defineTool, dirsOf, selfCardOf, recentNotes, assertCanTeach, callerLabel } = rt

  return defineTool({
    name: 'role',
    description:
      '读取你自己的岗位约定，或查看岗位目录、加载岗位声明的技能、记录一条经验。'
      + '被分配岗位的子代理开场即可看到紧凑岗位卡片；这个工具用于读取全文、查看其它岗位、以及把经验写回岗位。',
    parameters: {
      action: {
        type: 'string',
        enum: ['brief', 'list', 'read', 'skill', 'note', 'guide', 'notes'],
        description: 'brief（默认）读岗位卡；list 列出全部岗位；read 读指定岗位全文；skill 加载技能正文；note 追加一条经验；guide 读取或写入岗位指导；notes 在全部岗位经验里按关键词查找。',
      },
      query: {
        type: 'string',
        description: 'action=notes 时的关键词；命中的经验会连同所属岗位一起返回，用于借鉴别的岗位的做法。',
      },
      role: {
        type: 'string',
        description: '岗位 id。省略时使用你自己绑定的岗位；list 时忽略。',
      },
      skill: {
        type: 'string',
        description: 'action=skill 时要加载的技能名，取自岗位卡里声明的 skills 或会话技能目录。',
      },
      text: {
        type: 'string',
        description: 'action=note 的经验正文（一条一事，写清触发场景与结论）；action=guide 时为新指导全文。',
      },
      scope: {
        type: 'string',
        enum: ['global', 'project'],
        description: '读取时限定作用域；省略则在项目与全局之间按项目优先解析。',
      },
    },
    output: { schema: TEXT_OUTPUT, render: (_args, value) => [{ type: 'text', text: value.text }] },
    async execute(args, exec) {
      const dirs = dirsOf(exec.agent)
      const self = selfCardOf(dirs, exec.agent)
      const action = typeof args.action === 'string' ? args.action : 'brief'
      const targetId = typeof args.role === 'string' && args.role !== '' ? args.role : self?.fields.id

      if (action === 'list') return { text: catalogText(dirs, packageRoot) }

      if (action === 'notes') {
        const needle = String(args.query ?? '').trim().toLowerCase()
        if (needle === '') throw new Error('action=notes 需要 query')
        const hits = searchNotes(dirs, needle)
        if (hits.length === 0) return { text: `没有经验条目包含“${args.query}”。` }
        const shown = hits.slice(0, 20)
        const lines = [`命中 ${hits.length} 条经验${hits.length > shown.length ? `，显示最近 ${shown.length} 条` : ''}：`]
        for (const hit of shown) {
          lines.push(`- [${hit.role}] ${hit.at.slice(0, 10)} · ${clip(hit.text.replace(/\s+/g, ' '), 260)}`)
        }
        return { text: lines.join('\n') }
      }

      if (action === 'skill') {
        const name = typeof args.skill === 'string' ? args.skill.trim() : ''
        if (name === '') throw new Error('action=skill 需要 skill 参数')
        const skills = ctx.get('skills')
        if (skills === undefined) throw new Error('这个组合里没有 skills 服务，无法加载技能')
        const cwd = await ctx.get('workingDirectory')?.ensure?.(exec.agent, exec.signal)
        const definition = await skills.get(name, { cwd, scope: exec.agent, signal: exec.signal })
        if (definition === undefined) throw new Error(`技能 "${name}" 不存在或当前作用域不可见`)
        return { text: `## 技能 ${definition.name}\n\n${definition.content}` }
      }

      if (action === 'note') {
        if (targetId === undefined) throw new Error('你没有绑定岗位；用 role 参数指定要写经验的岗位')
        const target = readRole(dirs, targetId)
        if (target === undefined) throw new Error(`岗位 "${targetId}" 不存在`)
        assertCanTeach(self, targetId)
        const text = String(args.text ?? '').trim()
        if (text === '') throw new Error('action=note 需要非空的 text')
        const entry = appendNote(dirs, { id: targetId, scope: target.scope, text, source: callerLabel(exec.agent) })
        return { text: `已写入岗位 ${targetId} 的经验（${entry.at}）。` }
      }

      if (action === 'guide') {
        if (targetId === undefined) throw new Error('你没有绑定岗位；用 role 参数指定岗位')
        const target = readRole(dirs, targetId)
        if (target === undefined) throw new Error(`岗位 "${targetId}" 不存在`)
        if (args.text !== undefined) {
          assertCanTeach(self, targetId)
          const path = writeGuide(dirs, { id: targetId, scope: target.scope, text: String(args.text) })
          return { text: `已更新岗位 ${targetId} 的指导：${path}` }
        }
        const guide = readGuide(dirs, targetId)
        return { text: guide.text.trim() === '' ? `岗位 ${targetId} 还没有指导文件：${guide.path}` : `## 岗位指导\n\n${guide.text}` }
      }

      if (targetId === undefined) {
        return { text: `你当前没有绑定岗位。\n\n${catalogText(dirs, packageRoot)}` }
      }
      const card = args.scope === undefined ? readRole(dirs, targetId) : readRoleIn(dirs, args.scope, targetId)
      if (card === undefined) throw new Error(`岗位 "${targetId}" 不存在`)
      const guide = readGuide(dirs, targetId)
      return {
        text: renderCard(card, {
          notes: recentNotes(dirs, targetId),
          guide: guide.text,
          maxChars: action === 'read' ? config.briefMaxChars : Math.floor(config.briefMaxChars / 2),
        }),
      }
    },
  })
}
