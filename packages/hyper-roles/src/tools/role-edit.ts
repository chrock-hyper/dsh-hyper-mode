/**
 * The `role_edit` tool: create, update and archive role cards.
 *
 * Writes are deliberately narrower than reads: creating or rewriting cards
 * belongs to the lead or to a role granted `edit-roles`.
 *
 * @module @chrock-studio/dsh-hyper-roles/tools/role-edit
 */
import { scopeLabel } from '../marker.ts'
import { parseList } from '../role-doc.ts'
import type { RoleScope } from '../scopes.ts'
import { archiveRole, createRole, saveRole } from '../store.ts'
import type { StaleRoleError } from '../store/cards.ts'
import type { ToolContext, ToolDefinition, ToolTextResult } from './context.ts'
import { TEXT_OUTPUT } from './context.ts'

/**
 * Build the `role_edit` tool definition.
 * @param rt - the shared tool context.
 * @returns the tool definition.
 */
export function createRoleEditTool(rt: ToolContext): ToolDefinition<ToolTextResult> {
  const { defineTool, dirsOf, selfCardOf, assertCanEdit, callerLabel } = rt

  return defineTool<ToolTextResult>({
    name: 'role_edit',
    description:
      '新建、修改或归档一个岗位。岗位是团队协作的持久约定，动它之前先读一遍现有卡片；'
      + '保存采用版本校验，读到的版本已变时会要求重读，避免覆盖别人的修改。'
      + '要写一张新卡或重写旧卡前，先加载 role-authoring 技能（role action=skill skill=role-authoring，'
      + '未安装时用 /hyper-skill install role-authoring）：它给了提问协议与卡片结构，不要凭想象直接写。',
    parameters: {
      action: {
        type: 'string',
        required: true,
        enum: ['create', 'update', 'archive'],
        description: 'create 新建；update 修改（只给要改的字段）；archive 归档（不删除）。',
      },
      id: { type: 'string', required: true, description: '岗位 id：小写字母、数字与连字符。' },
      scope: {
        type: 'string',
        enum: ['global', 'project'],
        description: '写入哪个作用域。create 省略时优先项目；update/archive 省略时用当前解析到的那个。',
      },
      title: { type: 'string', description: '岗位显示名（中文即可）。create 必填。' },
      body: { type: 'string', description: '岗位正文 Markdown，建议含职责、工作方式、交互对象、完成标准。' },
      capabilities: { type: 'string', description: '能力列表，逗号分隔。' },
      skills: { type: 'string', description: '该岗位常用的技能名，逗号分隔。' },
      handoffs: { type: 'string', description: '交接对象岗位 id，逗号分隔。' },
      can: { type: 'string', description: '权限授予，逗号分隔：edit-roles、train。' },
      model: {
        type: 'string',
        description: '该岗位委派时使用的模型，写 provider/model（如 opencode-go/deepseek-v4.1-flash）；'
          + '省略则继承父代理的默认路由。传空字符串表示清除。',
      },
      expected_version: { type: 'number', description: 'update 时的乐观锁：读到的 version，不匹配则失败。' },
    },
    output: { schema: TEXT_OUTPUT, render: (_args, value) => [{ type: 'text', text: value.text }] },
    async execute(args, exec): Promise<ToolTextResult> {
      const dirs = dirsOf(exec.agent)
      const self = selfCardOf(dirs, exec.agent)
      assertCanEdit(self)
      const id = String(args.id ?? '').trim()
      const actor = callerLabel(exec.agent)
      const action = String(args.action ?? '')

      if (action === 'create') {
        const scope: RoleScope = args.scope === 'global' || args.scope === 'project'
          ? args.scope
          : dirs.projectDir === undefined ? 'global' : 'project'
        const card = createRole(dirs, {
          scope,
          id,
          title: args.title,
          body: args.body,
          fields: {
            capabilities: parseList(args.capabilities),
            skills: parseList(args.skills),
            handoffs: parseList(args.handoffs),
            can: parseList(args.can),
            ...(typeof args.model === 'string' ? { model: args.model } : {}),
          },
        })
        return { text: `已创建岗位 ${card.fields.id} · ${card.fields.title}（${scopeLabel(card.scope)}作用域，v${card.fields.version}）` }
      }

      if (action === 'update') {
        try {
          const card = saveRole(dirs, {
            id,
            scope: args.scope === 'global' || args.scope === 'project' ? args.scope : undefined,
            body: typeof args.body === 'string' ? args.body : undefined,
            expectedVersion: typeof args.expected_version === 'number' ? args.expected_version : undefined,
            actor,
            fields: {
              ...(typeof args.title === 'string' && args.title !== '' ? { title: args.title } : {}),
              ...(args.capabilities === undefined ? {} : { capabilities: parseList(args.capabilities) }),
              ...(args.skills === undefined ? {} : { skills: parseList(args.skills) }),
              ...(args.handoffs === undefined ? {} : { handoffs: parseList(args.handoffs) }),
              ...(args.can === undefined ? {} : { can: parseList(args.can) }),
              ...(args.model === undefined ? {} : { model: String(args.model) }),
            },
          })
          return { text: `已保存岗位 ${card.fields.id}（${scopeLabel(card.scope)}作用域，v${card.fields.version}）` }
        } catch (error) {
          const stale = error as Partial<StaleRoleError> | null | undefined
          if (stale?.code === 'stale') {
            throw new Error(`岗位 "${id}" 已被修改（现在是 v${stale.currentVersion}）。先用 role action=read 重读，再带着新的 expected_version 重试。`)
          }
          throw error
        }
      }

      if (action === 'archive') {
        const target = archiveRole(dirs, {
          id,
          scope: args.scope === 'global' || args.scope === 'project' ? args.scope : undefined,
        })
        return { text: `已归档岗位 ${id} → ${target}` }
      }

      throw new Error(`未知 action "${action}"；可用 create / update / archive`)
    },
  })
}
