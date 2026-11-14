/**
 * Pure-logic tests for `/hyper-skill`.
 *
 * Discovery, path resolution, and the command grammar are plain functions over
 * temporary directories, so these assertions stay about the behavior the user
 * sees instead of the Cordis lifecycle. One test also checks the registration
 * metadata the Web client needs (a command with an `input` descriptor).
 */
import { afterEach, describe, expect, test } from 'bun:test'
import { lstatSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { apply, discoverSkills, findProjectRoot, parseSkillFile, runSkillCommand } from '../index.js'

const temporary = []

/**
 * Create a throwaway directory.
 * @param prefix - temp-name prefix.
 * @returns its absolute path; removed after the test.
 */
function makeTemp(prefix = 'hyper-skill-') {
  const root = mkdtempSync(join(tmpdir(), prefix))
  temporary.push(root)
  return root
}

/**
 * Write one file, creating its parent directories.
 * @param root - bundle root.
 * @param relative - slash-separated path below the root.
 * @param content - file body.
 */
function writeFile(root, relative, content) {
  const file = join(root, relative)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, content)
}

/**
 * Create a bundle with one directory skill (`one`) and one flat skill (`two`).
 * @returns its absolute path.
 */
function makeBundle() {
  const root = makeTemp('hyper-skill-bundle-')
  writeFile(root, 'plugins/alpha/skills/one/SKILL.md', '---\nname: one\ndescription: First skill.\n---\n\n# One\n')
  writeFile(root, 'plugins/beta/skills/two.md', '---\nname: two\ndescription: Second skill.\n---\n\n# Two\n')
  return root
}

/**
 * Build the directory map the command consumes.
 * @param bundleRoot - bundle with shipped skills.
 * @param options - omit either scanned root to model a missing context.
 * @returns the command's directory map.
 */
function dirsFor(bundleRoot, { project = true, user = true } = {}) {
  const projectRoot = project ? makeTemp('hyper-skill-project-') : undefined
  const homeRoot = user ? makeTemp('hyper-skill-home-') : undefined
  return {
    bundleRoot,
    projectSkillsDir: projectRoot ? join(projectRoot, '.dsh', 'skills') : undefined,
    userSkillsDir: homeRoot ? join(homeRoot, 'skills') : undefined,
  }
}

afterEach(() => {
  while (temporary.length > 0) rmSync(temporary.pop(), { recursive: true, force: true })
})

describe('discoverSkills', () => {
  test('finds directory bundles and flat files, sorted by name', () => {
    const root = makeBundle()

    const found = discoverSkills(root)

    expect(found.map((skill) => skill.name)).toEqual(['one', 'two'])
    expect(found[0]).toMatchObject({ plugin: 'alpha', directory: true })
    expect(found[1]).toMatchObject({ plugin: 'beta', directory: false })
    expect(found[0].source).toBe(join(root, 'plugins', 'alpha', 'skills', 'one'))
    expect(found[1].source).toBe(join(root, 'plugins', 'beta', 'skills', 'two.md'))
  })

  test('skips missing dirs, plain directories, and malformed frontmatter', () => {
    const root = makeTemp('hyper-skill-bundle-')
    writeFile(root, 'plugins/alpha/skills/no-file/README.md', 'not a skill\n')
    writeFile(root, 'plugins/beta/skills/broken/SKILL.md', '---\nname: broken\n---\n')
    writeFile(root, 'plugins/gamma/index.js', 'export {}\n')
    mkdirSync(join(root, 'plugins', 'delta', 'skills', 'empty'), { recursive: true })

    expect(discoverSkills(root)).toEqual([])
  })

  test('ignores a bundle without a plugins directory', () => {
    expect(discoverSkills(makeTemp('hyper-skill-bundle-'))).toEqual([])
  })
})

describe('parseSkillFile', () => {
  test('reads a folded block description', () => {
    const root = makeTemp()
    writeFile(
      root,
      'skill.md',
      '---\nname: folded\ndescription: >-\n  First line of the description\n  and its continuation.\n---\nbody\n',
    )

    expect(parseSkillFile(join(root, 'skill.md'))).toEqual({
      name: 'folded',
      description: 'First line of the description and its continuation.',
    })
  })

  test('tolerates a BOM and CRLF fences', () => {
    const root = makeTemp()
    writeFile(root, 'skill.md', '\uFEFF---\r\nname: crlf\r\ndescription: CRLF skill.\r\n---\r\nbody\r\n')

    expect(parseSkillFile(join(root, 'skill.md'))).toEqual({ name: 'crlf', description: 'CRLF skill.' })
  })

  test('rejects a file without frontmatter', () => {
    const root = makeTemp()
    writeFile(root, 'skill.md', '# no frontmatter\n')

    expect(parseSkillFile(join(root, 'skill.md'))).toBeUndefined()
  })
})

describe('findProjectRoot', () => {
  test('walks up to the nearest .git ancestor', () => {
    const root = makeTemp()
    mkdirSync(join(root, '.git'))
    const nested = join(root, 'src', 'deep')
    mkdirSync(nested, { recursive: true })

    expect(findProjectRoot(nested)).toBe(root)
  })

  test('falls back to the starting directory without a .git ancestor', () => {
    const root = makeTemp()
    const nested = join(root, 'src')
    mkdirSync(nested, { recursive: true })

    expect(findProjectRoot(nested)).toBe(nested)
  })
})

describe('runSkillCommand', () => {
  test('lists installable skills and the usage', () => {
    const dirs = dirsFor(makeBundle())

    const result = runSkillCommand(dirs, ' list')

    expect(result.kind).toBe('success')
    expect(result.text).toContain('可安装：one、two')
    expect(result.text).toContain('用法：/hyper-skill install <名称> [--project]')
  })

  test('treats empty input as list', () => {
    expect(runSkillCommand(dirsFor(makeBundle()), '').text).toContain('可安装：one、two')
  })

  test('installs into the user root by default, idempotently', () => {
    const dirs = dirsFor(makeBundle())

    const first = runSkillCommand(dirs, ' install one')
    const target = join(dirs.userSkillsDir, 'one')

    expect(first.kind).toBe('success')
    expect(first.text).toContain('已安装 one')
    expect(lstatSync(target).isSymbolicLink()).toBe(true)
    expect(runSkillCommand(dirs, ' install one').text).toContain('已安装：')
  })

  test('installs a flat skill with its .md name and into the project root on request', () => {
    const dirs = dirsFor(makeBundle())

    const result = runSkillCommand(dirs, ' install two --project')

    expect(result.kind).toBe('success')
    expect(lstatSync(join(dirs.projectSkillsDir, 'two.md')).isSymbolicLink()).toBe(true)
  })

  test('reports both roots in the list after installs', () => {
    const dirs = dirsFor(makeBundle())
    runSkillCommand(dirs, ' install one')
    runSkillCommand(dirs, ' install two --project')

    const result = runSkillCommand(dirs, ' list')

    expect(result.text).toContain('已安装：one（用户）、two（项目）')
  })

  test('rejects an unknown skill name and shows the choices', () => {
    const result = runSkillCommand(dirsFor(makeBundle()), ' install nope')

    expect(result.kind).toBe('error')
    expect(result.text).toContain('没有这个 skill：nope')
    expect(result.text).toContain('可选：one、two')
  })

  test('rejects a missing name and conflicting location flags', () => {
    const dirs = dirsFor(makeBundle())

    expect(runSkillCommand(dirs, ' install').text).toContain('缺少 skill 名称')
    expect(runSkillCommand(dirs, ' install one --project --user').text).toContain('只选一个安装位置')
    expect(runSkillCommand(dirs, ' install one').kind).toBe('success')
  })

  test('rejects --project when the session directory is unknown', () => {
    const dirs = dirsFor(makeBundle(), { project: false })

    const result = runSkillCommand(dirs, ' install one --project')

    expect(result.kind).toBe('error')
    expect(result.text).toContain('无法确定当前会话的工作目录')
  })

  test('refuses to overwrite a path it does not own', () => {
    const dirs = dirsFor(makeBundle())
    mkdirSync(dirs.userSkillsDir, { recursive: true })
    writeFileSync(join(dirs.userSkillsDir, 'one'), 'user file\n')

    const result = runSkillCommand(dirs, ' install one')

    expect(result.kind).toBe('error')
    expect(result.text).toContain('目标已存在且不是本 bundle 的链接')
  })

  test('removes its own links and reports a missing install afterwards', () => {
    const dirs = dirsFor(makeBundle())
    runSkillCommand(dirs, ' install one')
    runSkillCommand(dirs, ' install two --project')

    const removedOne = runSkillCommand(dirs, ' remove one')
    const removedTwo = runSkillCommand(dirs, ' remove two')

    expect(removedOne.kind).toBe('success')
    expect(removedOne.text).toContain('已卸载 one')
    expect(removedTwo.kind).toBe('success')
    expect(removedTwo.text).toContain('已卸载 two')
    expect(runSkillCommand(dirs, ' remove one').text).toContain('未安装')
  })

  test('never unlinks a foreign symlink', () => {
    const dirs = dirsFor(makeBundle())
    const outside = makeTemp('hyper-skill-outside-')
    mkdirSync(dirs.userSkillsDir, { recursive: true })
    symlinkSync(outside, join(dirs.userSkillsDir, 'one'), 'dir')

    const result = runSkillCommand(dirs, ' remove one')

    expect(result.kind).toBe('error')
    expect(result.text).toContain('不是本 bundle 的链接')
    expect(lstatSync(join(dirs.userSkillsDir, 'one')).isSymbolicLink()).toBe(true)
  })

  test('rejects an unknown subcommand with usage', () => {
    const result = runSkillCommand(dirsFor(makeBundle()), ' frobnicate')

    expect(result.kind).toBe('error')
    expect(result.text).toContain('未知子命令：frobnicate')
    expect(result.text).toContain('用法：/hyper-skill')
  })
})

describe('apply', () => {
  test('registers /hyper-skill with an input hint', () => {
    const registered = []
    const ctx = {
      commands: {
        register(definition) {
          registered.push(definition)
          return () => {}
        },
      },
      effect(factory) {
        return factory()
      },
      get() {
        return undefined
      },
    }

    apply(ctx)

    expect(registered).toHaveLength(1)
    expect(registered[0].name).toBe('hyper-skill')
    expect(registered[0].description).toContain('skills')
    expect(registered[0].input.hint).toContain('install')
    expect(typeof registered[0].handler).toBe('function')
  })
})
