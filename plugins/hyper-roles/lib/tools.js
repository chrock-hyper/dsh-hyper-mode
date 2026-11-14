/**
 * The three model-facing tools: read your role, delegate by role, edit roles.
 *
 * They are registered once at Host scope so every agent in every mode sees the
 * same definitions; what each call may do is decided per call from the caller's
 * bound role. Writes are deliberately narrower than reads: a child that is
 * working as a role may record experience for itself, while creating or
 * rewriting cards belongs to the lead or to a role granted `edit-roles`.
 *
 * @module @chrock-studio/dsh-hyper-mode/hyper-roles/tools
 */
import { boundRoleOf } from './binding.js'
import { bindLine, clip, renderBrief, renderCard, renderRoster, scopeLabel } from './marker.js'
import { parseList } from './role-doc.js'
import {
  appendNote,
  archiveRole,
  createRole,
  listBuiltins,
  listRoles,
  readGuide,
  readNotes,
  readRole,
  readRoleIn,
  saveRole,
  writeGuide,
} from './store.js'

/** Every result carries one model-facing text block; structured fields are for the UI. */
const TEXT_OUTPUT = {
  type: 'object',
  additionalProperties: false,
  properties: { text: { type: 'string', required: true } },
}

/**
 * Build the tool definitions for one mounted plugin instance.
 * @param options - context, configuration, scope resolver, projection handle and shipped helpers.
 * @returns the definitions to register.
 */
export function buildRoleTools(options) {
  const { ctx, config, bundleRoot, dirsForAgent, binding, shipped } = options
  const { defineTool } = shipped

  /** @param agent - calling agent. @returns its scope directories. */
  const dirsOf = (agent) => dirsForAgent(agent)

  /** @param dirs - scope directories. @param agent - caller. @returns the caller's own card, if bound. */
  const selfCardOf = (dirs, agent) => {
    const id = boundRoleOf(binding, agent)
    return id === undefined ? undefined : readRole(dirs, id)
  }

  /** @param dirs - scope directories. @param id - role id. @returns recent note entries for a card. */
  const recentNotes = (dirs, id) => readNotes(dirs, id).entries.slice(-config.notesShown)

  /**
   * Render every visible role for `action=list` and unbound briefs.
   * @param dirs - scope directories.
   * @returns the catalog text.
   */
  const catalogText = (dirs) => {
    const listed = listRoles(dirs)
    const lines = []
    if (listed.problems.length > 0) {
      lines.push(`有 ${listed.problems.length} 个岗位文件无法解析（用文件路径直接查看）：`)
      for (const problem of listed.problems) lines.push(`- ${problem.path} — ${problem.message}`)
      lines.push('')
    }
    const section = (label, rows) => {
      if (rows.length === 0) return
      lines.push(`${label}：`)
      for (const row of rows) {
        const flags = [row.shadowed === true ? '覆盖全局' : '', `v${row.version}`].filter((entry) => entry !== '').join('，')
        const hint = typeof row.summary === 'string' && row.summary !== '' ? ` — ${clip(row.summary, 100)}` : ''
        lines.push(`- ${row.id} · ${row.title}（${flags}）${hint}`)
      }
      lines.push('')
    }
    section('项目作用域', listed.project)
    section('全局作用域', listed.global)
    const builtins = listBuiltins(bundleRoot)
    if (builtins.length > 0) {
      lines.push('随包岗位（只读；在面板里复制到某个作用域后即可编辑）：')
      for (const row of builtins) lines.push(`- ${row.id} · ${row.title}`)
      lines.push('')
    }
    if (lines.length === 0) return '当前没有任何岗位。用 `role_edit` 的 action=create 新建一个。'
    return `${lines.join('\n').trimEnd()}\n\n用 \`role\` 读取某个岗位的职责与经验；委派用 \`role_spawn\`。`
  }

  /**
   * Assert that the caller may edit role cards.
   * @param card - the caller's own card, when bound.
   * @throws Error when a bound role lacks the grant.
   */
  const assertCanEdit = (card) => {
    if (card === undefined) return
    if (!card.fields.can.includes('edit-roles')) {
      throw new Error(`岗位 ${card.fields.id} 没有 edit-roles 权限，岗位卡只能由主代理或有该权限的岗位修改`)
    }
  }

  /**
   * Assert that the caller may write another role's notes or guide.
   * @param self - the caller's own card, when bound.
   * @param targetId - role being written.
   * @throws Error when the caller is a bound role without the `train` grant.
   */
  const assertCanTeach = (self, targetId) => {
    if (self === undefined || self.fields.id === targetId) return
    if (!self.fields.can.includes('train')) {
      throw new Error(`岗位 ${self.fields.id} 只能写自己的笔记与指导；跨岗位写入需要 train 权限`)
    }
  }

  /** @param agent - calling agent. @returns a short label for notes and changelogs. */
  const callerLabel = (agent) => {
    try {
      const names = ctx.get('subagents')?.namesOf?.(agent)
      if (typeof names?.name === 'string' && names.name !== '') return names.name
    } catch {
      // A non-tree agent has no name; the label is cosmetic.
    }
    return 'agent'
  }

  const roleTool = defineTool({
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

      if (action === 'list') return { text: catalogText(dirs) }

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
        return { text: `你当前没有绑定岗位。\n\n${catalogText(dirs)}` }
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

  const spawnTool = defineTool({
    name: 'role_spawn',
    description:
      '按岗位委派一个子代理：子代理的任务开头会带上该岗位卡片，并在会话里绑定这个岗位，'
      + '之后它自己的每一步都能读到岗位约定。用于把工作交给一个明确的角色，而不是一个泛泛的子代理。',
    parameters: {
      role: { type: 'string', required: true, description: '岗位 id，取自岗位目录。' },
      description: {
        type: 'string',
        required: true,
        description: "这次委派的简短描述（3-5 个词），用于界面展示，使用用户当前请求的语言。",
      },
      prompt: {
        type: 'string',
        required: true,
        description: '完整的自包含任务说明。它看不到你当前的对话，岗位卡片由工具自动附加，不要重复岗位职责。',
      },
      name: {
        type: 'string',
        description: '子代理名字，唯一于你创建的子代理：小写字母、数字与连字符，不超过 32 字符；省略则自动编号。',
      },
      cwd: {
        type: 'string',
        description: '子代理的初始工作目录；省略则继承调用者。',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          text: { type: 'string', required: true },
          kind: { type: 'string', required: true, const: 'activation' },
          name: { type: 'string', required: true },
          role: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.text }],
      presentationMeta: (_args, value) => ({ kind: value.kind, name: value.name }),
    },
    isConcurrencySafe: () => true,
    async execute(args, exec) {
      const parent = exec.agent
      if (parent === undefined) throw new Error('role_spawn 需要调用它的 agent')
      const subagents = ctx.get('subagents')
      if (subagents === undefined) throw new Error('这个组合里没有 subagents 服务，无法委派')
      const dirs = dirsOf(parent)
      const id = String(args.role ?? '').trim()
      const card = readRole(dirs, id)
      if (card === undefined) throw new Error(`岗位 "${id}" 不存在；用 role action=list 查看可用岗位`)
      const provider = config.provider
      if (subagents.getProvider(provider) === undefined) {
        throw new Error(`子代理 provider "${provider}" 未载入，无法委派`)
      }
      const guide = readGuide(dirs, id)
      const preamble = [
        bindLine(id),
        renderBrief(card, {
          notes: recentNotes(dirs, id),
          guide: guide.text,
          maxChars: config.briefMaxChars,
        }),
      ].join('\n')
      const maxDepth = subagents.resolveMaxDepth(undefined)
      const started = await subagents.startActivation({
        provider,
        label: String(args.description),
        ...(typeof args.name === 'string' && args.name !== '' ? { name: args.name } : {}),
        ...(typeof args.cwd === 'string' && args.cwd !== '' ? { cwd: args.cwd } : {}),
        prompt: [{ type: 'text', text: `${preamble}${String(args.prompt)}` }],
        parent,
        ...(maxDepth === undefined ? {} : { maxDepth }),
        signal: exec.signal,
        delivery: 'parent',
      })
      return {
        text: `started subagent ${started.name} in role ${id}`,
        kind: 'activation',
        name: started.name,
        role: id,
      }
    },
  })

  const editTool = defineTool({
    name: 'role_edit',
    description:
      '新建、修改或归档一个岗位。岗位是团队协作的持久约定，动它之前先读一遍现有卡片；'
      + '保存采用版本校验，读到的版本已变时会要求重读，避免覆盖别人的修改。',
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
      expected_version: { type: 'number', description: 'update 时的乐观锁：读到的 version，不匹配则失败。' },
    },
    output: { schema: TEXT_OUTPUT, render: (_args, value) => [{ type: 'text', text: value.text }] },
    async execute(args, exec) {
      const dirs = dirsOf(exec.agent)
      const self = selfCardOf(dirs, exec.agent)
      assertCanEdit(self)
      const id = String(args.id ?? '').trim()
      const actor = callerLabel(exec.agent)
      const action = String(args.action ?? '')

      if (action === 'create') {
        const scope = args.scope === 'global' || args.scope === 'project'
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
            },
          })
          return { text: `已保存岗位 ${card.fields.id}（${scopeLabel(card.scope)}作用域，v${card.fields.version}）` }
        } catch (error) {
          if (error?.code === 'stale') {
            throw new Error(`岗位 "${id}" 已被修改（现在是 v${error.currentVersion}）。先用 role action=read 重读，再带着新的 expected_version 重试。`)
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

  return [roleTool, spawnTool, editTool]
}

/**
 * Find experience entries across every visible role.
 * @param dirs - scope directories.
 * @param needle - lowercased keyword.
 * @returns matches newest first, each carrying its role id.
 */
function searchNotes(dirs, needle) {
  const listed = listRoles(dirs)
  const hits = []
  for (const row of [...listed.project, ...listed.global]) {
    for (const entry of readNotes(dirs, row.id).entries) {
      if (!entry.text.toLowerCase().includes(needle)) continue
      hits.push({ role: row.id, at: entry.at, source: entry.source, text: entry.text })
    }
  }
  return hits.sort((left, right) => String(right.at).localeCompare(String(left.at)))
}

/**
 * Render the roster section used by the system prompt.
 * @param dirs - scope directories.
 * @param options - max entries.
 * @returns the section text.
 */
export function rosterText(dirs, options = {}) {
  const listed = listRoles(dirs)
  const rows = [...listed.project, ...listed.global].map((row) => ({
    id: row.id,
    title: row.title,
    scope: row.scope,
    summary: row.summary,
  }))
  return renderRoster(rows, options)
}
