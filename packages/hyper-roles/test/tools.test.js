/**
 * Wiring test: the three tools are built against fake Host services so the
 * permission rules, the spawn preamble and the registration contract can be
 * asserted without mounting a runtime.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildRoleTools } from '../src/tools.ts'
import { createRole, readRole, saveRole } from '../src/store.ts'

const root = mkdtempSync(join(tmpdir(), 'hyper-roles-tools-'))
const dirs = {
  home: root,
  globalDir: join(root, 'global'),
  projectRoot: root,
  projectDir: join(root, 'project'),
}
const packageRoot = fileURLToPath(new URL('../', import.meta.url))

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

/** @param role - the role the fake caller is bound to. @returns a fake binding handle. */
function makeBinding(role) {
  return { stateOf: () => (role === undefined ? null : { role }) }
}

/** @returns a fake Host context recording subagent activations. */
function makeHost() {
  const activations = []
  const subagents = {
    getProvider: () => ({ name: 'spawn' }),
    resolveMaxDepth: () => 1,
    namesOf: () => ({ name: 'lead', parent: 'lead' }),
    startActivation: async (spec) => {
      activations.push(spec)
      return { name: spec.name ?? 'agent-1', childId: 'child' }
    },
  }
  const ctx = {
    get(name) {
      if (name === 'subagents') return subagents
      if (name === 'workingDirectory') return { get: () => root, ensure: async () => root }
      if (name === 'skills') return { get: async (skill) => ({ name: skill, content: `# ${skill}` }) }
      return undefined
    },
    logger: { info: () => {}, warn: () => {} },
  }
  return { ctx, activations }
}

/** @returns the tool definitions built for one caller binding. */
function toolsFor(role) {
  const { ctx, activations } = makeHost()
  const defs = buildRoleTools({
    ctx,
    config: {
      provider: 'spawn',
      maxRosterRoles: 20,
      briefMaxChars: 6000,
      selfSectionMaxChars: 1200,
      rosterSection: true,
      notesShown: 3,
    },
    packageRoot,
    dirsForAgent: () => dirs,
    binding: makeBinding(role),
    shipped: { defineTool: (options) => options },
  })
  const byName = Object.fromEntries(defs.map((definition) => [definition.name, definition]))
  return { byName, activations }
}

/** @param id - role id. @param title - display title. @param fields - extra fields. */
function ensureRole(id, title, fields = {}) {
  if (readRole(dirs, id) !== undefined) return
  createRole(dirs, { scope: 'project', id, title, body: '## 职责\n看风险。', fields })
}

const lead = { session: { id: 'lead-session' } }
const exec = { agent: lead, signal: new AbortController().signal }
const textOf = (value) => value.text

describe('tool surface', () => {
  test('exposes exactly the three role tools', () => {
    const { byName } = toolsFor(undefined)
    expect(Object.keys(byName).sort()).toEqual(['role', 'role_edit', 'role_spawn'])
  })

  test('an unbound brief lists the catalog instead of failing', async () => {
    const { byName } = toolsFor(undefined)
    const result = await byName.role.execute({}, exec)
    expect(textOf(result)).toContain('没有绑定岗位')
  })
})

describe('role_edit permissions', () => {
  test('an unbound caller may create a role', async () => {
    const { byName } = toolsFor(undefined)
    const result = await byName.role_edit.execute({
      action: 'create',
      id: 'reviewer',
      title: '代码评审员',
      body: '## 职责\n看风险。',
      capabilities: '静态分析, 回归',
    }, exec)
    expect(textOf(result)).toContain('已创建岗位 reviewer')
    expect(readRole(dirs, 'reviewer').fields.capabilities).toEqual(['静态分析', '回归'])
  })

  test('a bound role without edit-roles is refused', async () => {
    ensureRole('worker', '执行者')
    const { byName } = toolsFor('worker')
    await expect(byName.role_edit.execute({ action: 'update', id: 'worker', title: '改名' }, exec))
      .rejects.toThrow(/没有 edit-roles 权限/)
  })

  test('a granted role may edit cards', async () => {
    ensureRole('steward', '管理员', { can: ['edit-roles'] })
    const { byName } = toolsFor('steward')
    const result = await byName.role_edit.execute({ action: 'update', id: 'worker', title: '执行者二' }, exec)
    expect(textOf(result)).toContain('已保存岗位 worker')
    expect(readRole(dirs, 'worker').fields.title).toBe('执行者二')
  })

  test('a stale update explains how to recover', async () => {
    const { byName } = toolsFor(undefined)
    await expect(byName.role_edit.execute({
      action: 'update',
      id: 'worker',
      body: 'x',
      expected_version: 99,
    }, exec)).rejects.toThrow(/已被修改.*重读/s)
  })
})

describe('notes', () => {
  test('a bound role writes its own note', async () => {
    ensureRole('noter', '记录者')
    const { byName } = toolsFor('noter')
    const result = await byName.role.execute({ action: 'note', text: '先看测试再看实现' }, exec)
    expect(textOf(result)).toContain('已写入岗位 noter 的经验')
  })

  test('a role without train cannot write another role note', async () => {
    ensureRole('architect', '架构师')
    const { byName } = toolsFor('noter')
    await expect(byName.role.execute({ action: 'note', role: 'architect', text: 'x' }, exec))
      .rejects.toThrow(/跨岗位写入需要 train 权限/)
  })

  test('a trainer may write another role note', async () => {
    ensureRole('coach', '培训员', { can: ['train'] })
    const { byName } = toolsFor('coach')
    const result = await byName.role.execute({ action: 'note', role: 'architect', text: '分歧要写依据' }, exec)
    expect(textOf(result)).toContain('已写入岗位 architect 的经验')
  })
})

describe('cross-role experience search', () => {
  test('finds a note by keyword and reports its role', async () => {
    ensureRole('searcher', '检索者')
    const { byName } = toolsFor('searcher')
    const result = await byName.role.execute({ action: 'notes', query: '依据' }, exec)
    expect(textOf(result)).toContain('[architect]')
    expect(textOf(result)).toContain('分歧要写依据')
  })

  test('requires a query', async () => {
    const { byName } = toolsFor(undefined)
    await expect(byName.role.execute({ action: 'notes' }, exec)).rejects.toThrow(/需要 query/)
  })
})

describe('role_spawn', () => {
  test('prepends the marker and the role card, then starts an activation', async () => {
    ensureRole('spawn-target', '评审员')
    const { byName, activations } = toolsFor(undefined)
    const result = await byName.role_spawn.execute({
      role: 'spawn-target',
      description: '评审这个补丁',
      prompt: '请评审 src/index.js 的改动。',
      name: 'peer',
    }, exec)
    expect(result).toEqual(expect.objectContaining({ kind: 'activation', name: 'peer', role: 'spawn-target' }))
    const spec = activations[0]
    expect(spec.provider).toBe('spawn')
    expect(spec.delivery).toBe('parent')
    expect(spec.parent).toBe(lead)
    expect(spec.maxDepth).toBe(1)
    const text = spec.prompt[0].text
    expect(text.startsWith('<!-- role:spawn-target -->')).toBe(true)
    expect(text).toContain('评审员')
    expect(text).toContain('请评审 src/index.js 的改动。')
  })

  test('rejects an unknown role', async () => {
    const { byName, activations } = toolsFor(undefined)
    await expect(byName.role_spawn.execute({ role: 'nobody', description: 'x', prompt: 'y' }, exec))
      .rejects.toThrow(/不存在/)
    expect(activations.length).toBe(0)
  })
})

describe('skills', () => {
  test('loads a skill body through the skills service', async () => {
    const { byName } = toolsFor(undefined)
    const result = await byName.role.execute({ action: 'skill', skill: 'role-training' }, exec)
    expect(textOf(result)).toContain('# role-training')
  })
})

describe('store integration', () => {
  test('saving through the store keeps titles stable for the roster', () => {
    const saved = saveRole(dirs, { id: 'worker', body: '## 职责\n换一段。' })
    expect(saved.fields.title).toBe('执行者二')
    expect(saved.fields.version).toBeGreaterThan(1)
  })
})

describe('role_spawn model routing', () => {
  test('passes a provider/model card field to the activation as agent options', async () => {
    ensureRole('routed', '外包岗', { model: 'opencode-go/deepseek-v4.1-flash' })
    const { byName, activations } = toolsFor(undefined)
    const result = await byName.role_spawn.execute({ role: 'routed', description: '外包一段', prompt: '写点东西' }, exec)
    expect(activations[0].agentOptions).toEqual({ provider: 'opencode-go', model: 'deepseek-v4.1-flash' })
    expect(result.text).toContain('deepseek-v4.1-flash')
    expect(activations[0].prompt[0].text).toContain('模型：opencode-go/deepseek-v4.1-flash')
  })

  test('leaves agent options unset when the card pins no model', async () => {
    ensureRole('unrouted', '普通岗')
    const { byName, activations } = toolsFor(undefined)
    await byName.role_spawn.execute({ role: 'unrouted', description: '普通一段', prompt: '做点事' }, exec)
    expect(activations[0].agentOptions).toBeUndefined()
  })
})
