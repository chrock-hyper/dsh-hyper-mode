/**
 * `/hyper-skill`: install this bundle's plugin-shipped skills on demand.
 *
 * DSH discovers skills only from scanned roots (project `<root>/.dsh/skills`,
 * `~/.dsh/skills`, `customSkillDirs`, …) and `skill-filesystem` watches those
 * roots, so a skill linked into one shows up in the next catalog without a
 * restart. This command is the human surface for that: it lists the skills the
 * bundle ships, links the chosen one into a scanned root, and reports where it
 * landed. No model message, no prompt token cost.
 *
 * The command declares `input` on purpose: the Web client only routes argument
 * text to a command that advertises an input descriptor. It lives at Host scope
 * so every mode sees it, and it registers no system-prompt text.
 *
 * Module scope imports only Node builtins: the Cordis loader turns a rejected
 * plugin import into a bare `never started` row with the cause only in the Host
 * log, so this file must not resolve any shipped package at import time.
 *
 * @module @chrock-studio/dsh-hyper-mode/hyper-skills
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { loadShipped } from '../shared/shipped.js'

/** Cordis plugin name. */
export const name = 'hyper-skills'
/** Needs only the human-command registry. */
export const inject = ['commands']

/** Command name without the leading slash. */
const COMMAND_NAME = 'hyper-skill'
/** Shown in the composer input box and in every failure message. */
const USAGE = '用法：/hyper-skill list | install <名称> [--project] | remove <名称>'
/** Kebab-case skill name, matching the skill provider's own rule. */
const SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
/** Keep the toast short enough to read in one glance. */
const NAME_LIST_LIMIT = 6

/**
 * Read the `name` and `description` fields from one skill file.
 *
 * Frontmatter is a YAML document, but the command only needs two scalar fields,
 * so this accepts the shapes skills actually use (plain, quoted, folded block)
 * and drops anything without both fields — mirroring the provider, which also
 * skips a malformed skill instead of failing the catalog.
 * @param file - absolute path to a `SKILL.md` or flat `<name>.md`.
 * @returns the parsed fields, or undefined for an unreadable or invalid file.
 */
export function parseSkillFile(file) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    return undefined
  }
  const block = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)
  if (!block) return undefined
  const fields = parseFields(block[1])
  if (typeof fields.name !== 'string' || fields.name === '') return undefined
  if (typeof fields.description !== 'string' || fields.description === '') return undefined
  return { name: fields.name, description: fields.description }
}

/**
 * Parse the two frontmatter fields this command reads.
 * @param block - frontmatter lines between the `---` fences.
 * @returns the name and description found, possibly empty.
 */
function parseFields(block) {
  const fields = {}
  const lines = block.split(/\r?\n/)
  for (let index = 0; index < lines.length; index += 1) {
    const match = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/.exec(lines[index])
    if (!match) continue
    const [, key, raw] = match
    if (key !== 'name' && key !== 'description') continue
    let value = raw.trim()
    if (/^[>|][-+]?$/.test(value)) {
      const collected = []
      while (index + 1 < lines.length) {
        const next = lines[index + 1]
        if (next.trim() === '') {
          index += 1
          continue
        }
        if (!/^[ \t]+\S/.test(next)) break
        collected.push(next.trim())
        index += 1
      }
      value = collected.join(' ').trim()
    }
    fields[key] = unquote(value)
  }
  return fields
}

/**
 * Strip one pair of matching YAML quotes.
 * @param value - raw scalar text.
 * @returns the unquoted scalar.
 */
function unquote(value) {
  if (value.length < 2) return value
  const first = value[0]
  const last = value[value.length - 1]
  if ((first === '"' && last === '"') || (first === "'" && last === "'")) return value.slice(1, -1)
  return value
}

/**
 * List the skills shipped by this bundle's plugins.
 *
 * Scans `<bundle>/plugins/<plugin>/skills/` one level deep: a directory bundle
 * `/<name>/SKILL.md` or a flat `/<name>.md`. Nested trees are deliberately
 * ignored, matching `skill-filesystem`'s discovery contract.
 * @param bundleRoot - absolute path of this bundle package.
 * @returns sorted installable skills, each with its owning plugin and source path.
 */
export function discoverSkills(bundleRoot) {
  const pluginsDir = join(bundleRoot, 'plugins')
  let pluginEntries
  try {
    pluginEntries = readdirSync(pluginsDir, { withFileTypes: true })
  } catch {
    return []
  }
  const skills = []
  for (const plugin of pluginEntries) {
    if (!plugin.isDirectory() || plugin.name.startsWith('.')) continue
    const skillsDir = join(pluginsDir, plugin.name, 'skills')
    let entries
    try {
      entries = readdirSync(skillsDir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      let file
      let source
      let directory = false
      if (entry.isDirectory()) {
        file = join(skillsDir, entry.name, 'SKILL.md')
        source = join(skillsDir, entry.name)
        directory = true
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        file = join(skillsDir, entry.name)
        source = file
      } else {
        continue
      }
      if (!existsSync(file)) continue
      const parsed = parseSkillFile(file)
      if (!parsed) continue
      skills.push({ ...parsed, plugin: plugin.name, source, directory })
    }
  }
  return skills.sort((left, right) => left.name.localeCompare(right.name))
}

/**
 * Run the `/hyper-skill` grammar.
 *
 * Pure over the given directories so tests can drive it without Cordis.
 * @param dirs - bundle root plus the two scanned roots (the project one may be absent).
 * @param rawInput - text after the command name, including its leading whitespace.
 * @returns a `success` or `error` result for the dispatching UI.
 */
export function runSkillCommand(dirs, rawInput) {
  const skills = discoverSkills(dirs.bundleRoot)
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
function listSkills(dirs, skills) {
  const rows = skills.map((skill) => ({ skill, where: installedWhere(dirs, skill) }))
  const available = rows.filter((row) => row.where.length === 0)
  const installed = rows.filter((row) => row.where.length > 0)
  const parts = []
  if (available.length > 0) parts.push(`可安装：${nameList(available.map((row) => row.skill.name))}`)
  if (installed.length > 0) {
    parts.push(`已安装：${installed.map((row) => `${row.skill.name}（${row.where.join('、')}）`).join('、')}`)
  }
  parts.push(`用法：/hyper-skill install <名称> [--project]`)
  return ok(parts.join('。'))
}

/**
 * Install one discovered skill into the chosen scanned root.
 * @param dirs - resolved skill directories.
 * @param skills - discovered bundle skills.
 * @param tokens - arguments after `install`.
 * @returns a success or error result.
 */
function installFromCommand(dirs, skills, tokens) {
  const project = tokens.includes('--project') || tokens.includes('-p')
  const user = tokens.includes('--user') || tokens.includes('-u')
  const skillName = tokens.find((token) => !token.startsWith('-'))
  if (skillName === undefined) return fail(`缺少 skill 名称。${USAGE}`)
  if (project && user) return fail('只选一个安装位置：--project 或 --user。')
  const skill = skills.find((entry) => entry.name === skillName)
  if (!skill) return fail(`没有这个 skill：${skillName}。可选：${nameList(skills.map((entry) => entry.name))}`)
  const root = project ? dirs.projectSkillsDir : dirs.userSkillsDir
  if (!root) return fail('无法确定当前会话的工作目录；不加 --project 时默认装到 ~/.dsh/skills。')
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
function removeFromCommand(dirs, tokens) {
  const skillName = tokens.find((token) => !token.startsWith('-'))
  if (skillName === undefined) return fail(`缺少 skill 名称。${USAGE}`)
  if (!SKILL_NAME.test(skillName)) return fail('skill 名称只能用小写字母、数字与连字符。')
  const removed = []
  const foreign = []
  for (const root of [dirs.projectSkillsDir, dirs.userSkillsDir]) {
    if (!root) continue
    const outcome = removeSkill(root, skillName, dirs.bundleRoot)
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
 * Link one skill directory into a scanned root.
 * @param root - target scanned root, created when missing.
 * @param skill - discovered bundle skill.
 * @returns the resulting state and target path.
 */
function installSkill(root, skill) {
  const target = join(root, linkName(skill))
  let existing
  try {
    existing = lstatSync(target)
  } catch (error) {
    if (error.code !== 'ENOENT') return { status: 'error', target, message: error.message }
    existing = undefined
  }
  if (existing) {
    if (isOwnedLink(target, skill.source)) return { status: 'already', target }
    return { status: 'conflict', target }
  }
  try {
    mkdirSync(root, { recursive: true })
    symlinkSync(skill.source, target, linkType(skill.directory))
  } catch (error) {
    return { status: 'error', target, message: error.message }
  }
  return { status: 'installed', target }
}

/**
 * Remove links for one skill, trying both the directory and flat-file names.
 * @param root - scanned root holding the candidates.
 * @param skillName - frontmatter name, without an extension.
 * @param bundleRoot - this bundle package root.
 * @returns the removed or foreign targets, or an absent/error state.
 */
function removeSkill(root, skillName, bundleRoot) {
  const removed = []
  const foreign = []
  for (const candidate of [skillName, `${skillName}.md`]) {
    const target = join(root, candidate)
    let stat
    try {
      stat = lstatSync(target)
    } catch {
      continue
    }
    if (!stat.isSymbolicLink() || !isInsideBundle(target, bundleRoot)) {
      foreign.push(target)
      continue
    }
    try {
      unlinkSync(target)
    } catch (error) {
      return { status: 'error', target, message: error.message }
    }
    removed.push(target)
  }
  if (removed.length > 0) return { status: 'removed', targets: removed }
  if (foreign.length > 0) return { status: 'foreign', targets: foreign }
  return { status: 'absent', targets: [] }
}

/**
 * The name a skill needs inside a scanned root.
 * @param skill - discovered bundle skill.
 * @returns the frontmatter name, plus `.md` for a flat-file skill.
 */
function linkName(skill) {
  return skill.directory ? skill.name : `${skill.name}.md`
}

/**
 * Report which scanned roots already hold this skill's link.
 * @param dirs - resolved skill directories.
 * @param skill - discovered bundle skill.
 * @returns root labels, e.g. `['用户']`.
 */
function installedWhere(dirs, skill) {
  const where = []
  if (dirs.projectSkillsDir && isOwnedLink(join(dirs.projectSkillsDir, linkName(skill)), skill.source)) {
    where.push('项目')
  }
  if (dirs.userSkillsDir && isOwnedLink(join(dirs.userSkillsDir, linkName(skill)), skill.source)) {
    where.push('用户')
  }
  return where
}

/**
 * True when the target is a symlink resolving to the given skill source.
 * @param target - candidate link path.
 * @param source - skill source path inside this bundle.
 * @returns whether the link already points at exactly this skill.
 */
function isOwnedLink(target, source) {
  try {
    if (!lstatSync(target).isSymbolicLink()) return false
    return realpathSync(target) === realpathSync(source)
  } catch {
    return false
  }
}

/**
 * True when the link resolves inside this bundle, keeping removal safe.
 * @param target - candidate link path.
 * @param bundleRoot - this bundle package root.
 * @returns whether the link belongs to this bundle.
 */
function isInsideBundle(target, bundleRoot) {
  try {
    const real = realpathSync(target)
    const root = realpathSync(bundleRoot)
    return real === root || real.startsWith(`${root}${sep}`)
  } catch {
    return false
  }
}

/**
 * Choose the symlink flavor for the current platform.
 * @param directory - whether the skill is a directory bundle.
 * @returns a `fs.symlink` type argument.
 */
function linkType(directory) {
  if (process.platform !== 'win32') return directory ? 'dir' : 'file'
  return directory ? 'junction' : 'file'
}

/**
 * Find the project root the skill provider would use.
 * @param start - the session's current directory.
 * @returns the nearest ancestor containing `.git`, else `start`.
 */
export function findProjectRoot(start) {
  const origin = resolve(start)
  let dir = origin
  while (true) {
    if (existsSync(join(dir, '.git'))) return dir
    const parent = dirname(dir)
    if (parent === dir) return origin
    dir = parent
  }
}

/**
 * Resolve `<dsh home>/skills` the way the skill provider does.
 * @param ctx - mounting context, used only for the installation anchor.
 * @returns the user-level scanned root.
 */
function resolveUserSkillsDir(ctx) {
  try {
    const homePaths = loadShipped('@deepseek-ai/dsh-home-paths', ctx)
    const resolved = homePaths?.dshHomePath?.('skills')
    if (typeof resolved === 'string' && resolved !== '') return resolved
  } catch {
    // Fall through to the documented default.
  }
  return join(homedir(), '.dsh', 'skills')
}

/**
 * Resolve the project-level scanned root for the invoking session.
 * @param ctx - Host context.
 * @param agent - the agent whose UI dispatched the command.
 * @returns `<project root>/.dsh/skills`, or undefined without a known directory.
 */
function resolveProjectSkillsDir(ctx, agent) {
  let cwd
  try {
    cwd = ctx.get('workingDirectory')?.get?.(agent?.session)
  } catch {
    cwd = undefined
  }
  if (typeof cwd !== 'string' || cwd === '') return undefined
  return join(findProjectRoot(cwd), '.dsh', 'skills')
}

/**
 * Display a path relative to the OS home when it lives there.
 * @param target - absolute path.
 * @returns `~/…` for home-relative paths, else the unchanged path.
 */
function display(target) {
  const home = homedir()
  return target === home || target.startsWith(`${home}${sep}`) ? `~${target.slice(home.length)}` : target
}

/**
 * Join names for one notice line, eliding a long tail.
 * @param names - skill names.
 * @returns a comma-separated summary.
 */
function nameList(names) {
  if (names.length <= NAME_LIST_LIMIT) return names.join('、')
  return `${names.slice(0, NAME_LIST_LIMIT).join('、')} 等 ${names.length} 个`
}

/** @param text - success notice text. */
function ok(text) {
  return { kind: 'success', text }
}

/** @param text - failure notice text. */
function fail(text) {
  return { kind: 'error', text }
}

/**
 * Register `/hyper-skill` for every composed human-command adapter.
 * @param ctx - Host context carrying the command registry.
 */
export function apply(ctx) {
  const bundleRoot = fileURLToPath(new URL('../../', import.meta.url))
  const userSkillsDir = resolveUserSkillsDir(ctx)
  ctx.effect(
    () =>
      ctx.commands.register({
        name: COMMAND_NAME,
        description: '按需安装本 bundle 插件自带的 skills',
        input: { hint: 'list | install <名称> [--project] | remove <名称>' },
        handler: (invocation) =>
          runSkillCommand(
            {
              bundleRoot,
              userSkillsDir,
              projectSkillsDir: resolveProjectSkillsDir(ctx, invocation.agent),
            },
            invocation.rawInput,
          ),
      }),
    'hyper-skills: command',
  )
}
