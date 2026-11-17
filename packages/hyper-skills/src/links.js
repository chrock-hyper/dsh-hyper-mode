/**
 * 扫描根里的符号链接：安装、卸载、以及「这个链接是不是本 bundle 的」。
 *
 * 这里每次写之前都要判断所有权：扫描根是共享目录，同名路径可能是别人的。
 * 只有解析后落在本 bundle 的 `packages/` 内，才允许删除。
 *
 * @module @chrock-studio/dsh-hyper-skills/links
 */
import { lstatSync, mkdirSync, realpathSync, symlinkSync, unlinkSync } from 'node:fs'
import { join, sep } from 'node:path'

/**
 * The name a skill needs inside a scanned root.
 * @param skill - discovered bundle skill.
 * @returns the frontmatter name, plus `.md` for a flat-file skill.
 */
function linkName(skill) {
  return skill.directory ? skill.name : `${skill.name}.md`
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
 * @param packagesRoot - this bundle's packages directory.
 * @returns whether the link belongs to this bundle.
 */
function isInsideBundle(target, packagesRoot) {
  try {
    const real = realpathSync(target)
    const root = realpathSync(packagesRoot)
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
 * Link one skill directory into a scanned root.
 * @param root - target scanned root, created when missing.
 * @param skill - discovered bundle skill.
 * @returns the resulting state and target path.
 */
export function installSkill(root, skill) {
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
 * @param packagesRoot - this bundle's packages directory.
 * @returns the removed or foreign targets, or an absent/error state.
 */
export function removeSkill(root, skillName, packagesRoot) {
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
    if (!stat.isSymbolicLink() || !isInsideBundle(target, packagesRoot)) {
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
 * Report which scanned roots already hold this skill's link.
 * @param dirs - resolved skill directories.
 * @param skill - discovered bundle skill.
 * @returns root labels, e.g. `['用户']`.
 */
export function installedWhere(dirs, skill) {
  const where = []
  if (dirs.projectSkillsDir && isOwnedLink(join(dirs.projectSkillsDir, linkName(skill)), skill.source)) {
    where.push('项目')
  }
  if (dirs.userSkillsDir && isOwnedLink(join(dirs.userSkillsDir, linkName(skill)), skill.source)) {
    where.push('用户')
  }
  return where
}
