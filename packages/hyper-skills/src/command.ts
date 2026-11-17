/**
 * `/hyper-skill` 的命令文法：list / install / remove。
 *
 * 纯函数地对给定目录求值，测试不需要 Cordis 就能驱动整条命令。
 *
 * @module @chrock-studio/dsh-hyper-skills/command
 */
import { homedir } from 'node:os'
import { sep } from 'node:path'

import type { BundledSkill } from './discover.ts'
import { discoverSkills } from './discover.ts'
import type { SkillDirs } from './links.ts'
import { installSkill, installedWhere, removeSkill } from './links.ts'

/** What the dispatching UI renders. */
export interface CommandResult {
  kind: 'success' | 'error'
  text: string
}

/** Shown in the composer input box and in every failure message. */
export const USAGE = '用法：/hyper-skill list | install [<名称>|--all] [--project] | remove <名称>'
/** Kebab-case skill name, matching the skill provider's own rule. */
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
/** Keep the toast short enough to read in one glance. */
const NAME_LIST_LIMIT = 6

/**
 * Run the `/hyper-skill` grammar.
 *
 * Pure over the given directories so tests can drive it without Cordis.
 * @param dirs - bundle root plus the two scanned roots (the project one may be absent).
 * @param rawInput - text after the command name, including its leading whitespace.
 * @returns a `success` or `error` result for the dispatching UI.
 */
export function runSkillCommand(dirs: SkillDirs, rawInput: string | undefined): CommandResult {
  const skills = discoverSkills(dirs.packagesRoot)
  if (skills.length === 0) return fail('本 bundle 没有随包 skill。')
  const tokens = String(rawInput ?? '').trim().split(/\s+/).filter(Boolean)
  const head = tokens[0] ?? 'list'
  if (head === 'list' || head === 'ls') return listSkills(dirs, skills)
  if (head === 'install' || head === 'add') return installFromCommand(dirs, skills, tokens.slice(1))
  if (head === 'remove' || head === 'uninstall' || head === 'rm') return removeFromCommand(dirs, tokens.slice(1))
  return fail(`未知子命令：${head}。${USAGE}`)
}

/**
 * Report what is installable and where the installed copies live.
 * @param dirs - resolved skill directories.
 * @param skills - discovered bundle skills.
 * @returns a one-line success result.
 */
function listSkills(dirs: SkillDirs, skills: BundledSkill[]): CommandResult {
  const rows = skills.map((skill) => ({ skill, where: installedWhere(dirs, skill) }))
  const available = rows.filter((row) => row.where.length === 0)
  const installed = rows.filter((row) => row.where.length > 0)
  const parts: string[] = []
  if (available.length > 0) parts.push(`可安装：${nameList(available.map((row) => row.skill.name))}`)
  if (installed.length > 0) {
    parts.push(`已安装：${installed.map((row) => `${row.skill.name}（${row.where.join('、')}）`).join('、')}`)
  }
  parts.push('用法：/hyper-skill install [<名称>|--all] [--project]')
  return ok(parts.join('。'))
}

/**
 * Install one discovered skill into the chosen scanned root.
 * @param dirs - resolved skill directories.
 * @param skills - discovered bundle skills.
 * @param tokens - arguments after `install`.
 * @returns a success or error result.
 */
function installFromCommand(dirs: SkillDirs, skills: BundledSkill[], tokens: string[]): CommandResult {
  const project = tokens.includes('--project') || tokens.includes('-p')
  const user = tokens.includes('--user') || tokens.includes('-u')
  if (project && user) return fail('只选一个安装位置：--project 或 --user。')
  const root = project ? dirs.projectSkillsDir : dirs.userSkillsDir
  if (!root) return fail('无法确定当前会话的工作目录；不加 --project 时默认装到 ~/.dsh/skills。')
  const skillName = tokens.find((token) => !token.startsWith('-'))
  if (skillName === undefined || tokens.includes('--all') || tokens.includes('-a')) {
    return installAll(skills, root, project)
  }
  const skill = skills.find((entry) => entry.name === skillName)
  if (!skill) return fail(`没有这个 skill：${skillName}。可选：${nameList(skills.map((entry) => entry.name))}`)
  const outcome = installSkill(root, skill)
  if (outcome.status === 'installed') {
    return ok(`已安装 ${skillName} → ${display(outcome.target)}（下一步进技能编目，无需重启）`)
  }
  if (outcome.status === 'already') return ok(`${skillName} 已安装：${display(outcome.target)}`)
  if (outcome.status === 'conflict') {
    return fail(`目标已存在且不是本 bundle 的链接：${display(outcome.target)}`)
  }
  return fail(`安装失败：${outcome.message}`)
}

/**
 * Remove this bundle's links for one skill from both scanned roots.
 * @param dirs - resolved skill directories.
 * @param tokens - arguments after `remove`.
 * @returns a success or error result.
 */
function removeFromCommand(dirs: SkillDirs, tokens: string[]): CommandResult {
  const skillName = tokens.find((token) => !token.startsWith('-'))
  if (skillName === undefined) return fail(`缺少 skill 名称。${USAGE}`)
  if (!SKILL_NAME.test(skillName)) return fail('skill 名称只能用小写字母、数字与连字符。')
  const removed: string[] = []
  const foreign: string[] = []
  for (const root of [dirs.projectSkillsDir, dirs.userSkillsDir]) {
    if (!root) continue
    const outcome = removeSkill(root, skillName, dirs.packagesRoot)
    if (outcome.status === 'error') return fail(`卸载失败：${outcome.message}`)
    if (outcome.status === 'removed') removed.push(...outcome.targets)
    else if (outcome.status === 'foreign') foreign.push(...outcome.targets)
  }
  if (removed.length > 0) return ok(`已卸载 ${skillName}：${removed.map(display).join('，')}`)
  if (foreign.length > 0) {
    return fail(`${skillName} 的同名路径不是本 bundle 的链接，未删除：${foreign.map(display).join('，')}`)
  }
  return fail(`${skillName} 未安装。`)
}

/**
 * Install every shipped skill that is not already present.
 *
 * `install` with no name is the bulk form: it is the command a fresh profile
 * wants, and it reports per-skill outcomes instead of stopping on the first
 * conflict (a foreign directory with the same name is skipped, not fatal).
 * @param skills - discovered bundle skills.
 * @param root - target scanned root.
 * @param project - whether the target is the project root.
 * @returns a one-line summary.
 */
function installAll(skills: BundledSkill[], root: string, project: boolean): CommandResult {
  const installed: string[] = []
  const already: string[] = []
  const skipped: string[] = []
  for (const skill of skills) {
    const outcome = installSkill(root, skill)
    if (outcome.status === 'installed') installed.push(skill.name)
    else if (outcome.status === 'already') already.push(skill.name)
    else skipped.push(skill.name)
  }
  const where = project ? '项目' : '用户'
  const parts: string[] = []
  if (installed.length > 0) parts.push(`已安装到${where}：${nameList(installed)}`)
  if (already.length > 0) parts.push(`已存在：${nameList(already)}`)
  if (skipped.length > 0) parts.push(`跳过（同名路径不是本 bundle 的链接）：${nameList(skipped)}`)
  parts.push('下一步进技能编目，无需重启')
  return ok(parts.join('。'))
}

/**
 * Display a path relative to the OS home when it lives there.
 * @param target - absolute path.
 * @returns `~/…` for home-relative paths, else the unchanged path.
 */
function display(target: string): string {
  const home = homedir()
  return target === home || target.startsWith(`${home}${sep}`) ? `~${target.slice(home.length)}` : target
}

/**
 * Join names for one notice line, eliding a long tail.
 * @param names - skill names.
 * @returns a comma-separated summary.
 */
function nameList(names: string[]): string {
  if (names.length <= NAME_LIST_LIMIT) return names.join('、')
  return `${names.slice(0, NAME_LIST_LIMIT).join('、')} 等 ${names.length} 个`
}

/** @param text - success notice text. */
function ok(text: string): CommandResult {
  return { kind: 'success', text }
}

/** @param text - failure notice text. */
function fail(text: string): CommandResult {
  return { kind: 'error', text }
}
