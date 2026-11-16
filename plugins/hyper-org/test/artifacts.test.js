/**
 * The artifact read surface is gone: the panel hands the path to DSH's own
 * sidebar. What is left to guard is the *status* the inspector shows — a path
 * that escapes must still be reported as `escape` instead of being opened, and
 * only a real file or directory may carry the absolute path the browser half
 * turns into a `dsh-resource://` address.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { artifactBase, describeArtifact } from '../lib/artifacts.js'

const root = mkdtempSync(join(tmpdir(), 'hyper-org-artifacts-'))
const base = join(root, 'project')
mkdirSync(join(base, 'notes'), { recursive: true })
mkdirSync(join(base, 'folder'), { recursive: true })
writeFileSync(join(base, 'notes', 'ok.txt'), 'hello\nworld\n', 'utf8')

const outside = join(root, 'outside.txt')
writeFileSync(outside, 'secret\n', 'utf8')
symlinkSync(outside, join(base, 'link-out.txt'))
symlinkSync(join(base, 'notes', 'ok.txt'), join(base, 'link-in.txt'))

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('describing declared artifacts', () => {
  test('reports file, directory, missing and escape kinds', () => {
    expect(describeArtifact(base, 'notes/ok.txt')).toEqual({
      path: 'notes/ok.txt',
      kind: 'file',
      bytes: 12,
      absolutePath: join(base, 'notes', 'ok.txt'),
    })
    expect(describeArtifact(base, 'folder')).toEqual({
      path: 'folder',
      kind: 'dir',
      absolutePath: join(base, 'folder'),
    })
    expect(describeArtifact(base, 'gone.txt')).toEqual({ path: 'gone.txt', kind: 'missing' })
    expect(describeArtifact(base, '../outside.txt')).toEqual({ path: '../outside.txt', kind: 'escape' })
    expect(describeArtifact(base, outside)).toEqual({ path: outside, kind: 'escape' })
  })

  test('only a file or a directory carries the absolute path the preview opens', () => {
    // `missing` and `escape` deliberately have none: a dead row cannot be
    // turned into a dsh-resource address by construction.
    expect(describeArtifact(base, 'notes/ok.txt').absolutePath).toBe(join(base, 'notes', 'ok.txt'))
    expect(describeArtifact(base, 'folder').absolutePath).toBe(join(base, 'folder'))
    expect('absolutePath' in describeArtifact(base, 'gone.txt')).toBe(false)
    expect('absolutePath' in describeArtifact(base, '../outside.txt')).toBe(false)
  })

  test('a symlink that stays inside the project is a file with a usable path', () => {
    const described = describeArtifact(base, 'link-in.txt')
    expect(described.kind).toBe('file')
    expect(described.absolutePath).toBe(join(base, 'link-in.txt'))
  })

  test('a symlink pointing outside the project is refused as escape', () => {
    expect(describeArtifact(base, 'link-out.txt')).toEqual({ path: 'link-out.txt', kind: 'escape' })
  })

  test('a percent-encoded traversal is decoded before judging', () => {
    expect(describeArtifact(base, '..%2F..%2Foutside.txt').kind).toBe('escape')
  })

  test('a NUL byte in a declared path is refused', () => {
    expect(describeArtifact(base, 'a\0b').kind).toBe('escape')
  })

  test('degrades to missing without a project root', () => {
    expect(artifactBase({ projectRoot: undefined })).toBeUndefined()
    expect(artifactBase({ projectRoot: '' })).toBeUndefined()
    expect(artifactBase({ projectRoot: base })).toBe(base)
    expect(describeArtifact(undefined, 'notes/ok.txt')).toEqual({ path: 'notes/ok.txt', kind: 'missing' })
  })
})
