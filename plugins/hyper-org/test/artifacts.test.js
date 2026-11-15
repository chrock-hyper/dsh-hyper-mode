/**
 * Artifact previews are a read surface over the project tree, so the guards are
 * the feature: a path that escapes, was never declared, points at a directory
 * or is not text must be refused with a code the panel can show.
 */
import { afterAll, describe, expect, test } from 'bun:test'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  artifactBase,
  describeArtifact,
  HARD_MAX_BYTES,
  MAX_BYTES,
  readArtifactText,
} from '../lib/artifacts.js'

const root = mkdtempSync(join(tmpdir(), 'hyper-org-artifacts-'))
const base = join(root, 'project')
mkdirSync(join(base, 'notes'), { recursive: true })
mkdirSync(join(base, 'folder'), { recursive: true })
writeFileSync(join(base, 'notes', 'ok.txt'), 'hello\nworld\n', 'utf8')
writeFileSync(join(base, 'wide.txt'), 'x'.repeat(MAX_BYTES + 5), 'utf8')
writeFileSync(join(base, 'huge.txt'), 'x'.repeat(HARD_MAX_BYTES + 1), 'utf8')
writeFileSync(join(base, 'binary.dat'), Buffer.from([0x50, 0x4b, 0x00, 0x01]))

const outside = join(root, 'outside.txt')
writeFileSync(outside, 'secret\n', 'utf8')
symlinkSync(outside, join(base, 'link-out.txt'))
symlinkSync(join(base, 'notes', 'ok.txt'), join(base, 'link-in.txt'))

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

/**
 * Run one read and return its refusal.
 * @param run - the call expected to throw.
 * @returns the thrown error.
 */
function refusal(run) {
  try {
    run()
  } catch (error) {
    return error
  }
  throw new Error('expected a refusal, but the read succeeded')
}

describe('reading a declared artifact', () => {
  test('returns the text and the on-disk size', () => {
    const result = readArtifactText({ base, declaredPaths: ['notes/ok.txt'], path: 'notes/ok.txt' })
    expect(result.ok).toBe(true)
    expect(result.text).toBe('hello\nworld\n')
    expect(result.bytes).toBe(12)
    expect(result.truncated).toBe(false)
  })

  test('follows a symlink that stays inside the project', () => {
    const result = readArtifactText({ base, declaredPaths: ['link-in.txt'], path: 'link-in.txt' })
    expect(result.text).toBe('hello\nworld\n')
  })

  test('truncates past the soft limit instead of refusing', () => {
    const result = readArtifactText({ base, declaredPaths: ['wide.txt'], path: 'wide.txt' })
    expect(result.truncated).toBe(true)
    expect(result.text).toHaveLength(MAX_BYTES)
    expect(result.bytes).toBe(MAX_BYTES + 5)
  })
})

describe('the five guards', () => {
  test('an undeclared path is refused even when the file exists', () => {
    const error = refusal(() => readArtifactText({ base, declaredPaths: ['notes/ok.txt'], path: 'wide.txt' }))
    expect(error.code).toBe('not_declared')
    expect(error.status).toBe(400)
  })

  test('an absolute path is refused before it reaches the filesystem', () => {
    const error = refusal(() => readArtifactText({ base, declaredPaths: [outside], path: outside }))
    expect(error.code).toBe('path_escape')
  })

  test('a traversal is refused even when the order declares it', () => {
    const error = refusal(() => readArtifactText({ base, declaredPaths: ['../outside.txt'], path: '../outside.txt' }))
    expect(error.code).toBe('path_escape')
  })

  test('a percent-encoded traversal is decoded before judging', () => {
    const encoded = '..%2F..%2Foutside.txt'
    const error = refusal(() => readArtifactText({ base, declaredPaths: [encoded], path: encoded }))
    expect(error.code).toBe('path_escape')
  })

  test('a symlink pointing outside the project is refused', () => {
    const error = refusal(() => readArtifactText({ base, declaredPaths: ['link-out.txt'], path: 'link-out.txt' }))
    expect(error.code).toBe('path_escape')
  })

  test('a directory is not previewed', () => {
    const error = refusal(() => readArtifactText({ base, declaredPaths: ['folder'], path: 'folder' }))
    expect(error.code).toBe('is_directory')
    expect(error.status).toBe(409)
  })

  test('a binary file is refused with a readable hint', () => {
    const error = refusal(() => readArtifactText({ base, declaredPaths: ['binary.dat'], path: 'binary.dat' }))
    expect(error.code).toBe('binary')
    expect(error.status).toBe(415)
    expect(error.message).toContain('复制路径')
  })

  test('a file past the hard ceiling is refused', () => {
    const error = refusal(() => readArtifactText({ base, declaredPaths: ['huge.txt'], path: 'huge.txt' }))
    expect(error.code).toBe('too_large')
    expect(error.status).toBe(413)
  })

  test('a missing file is a 404', () => {
    const error = refusal(() => readArtifactText({ base, declaredPaths: ['gone.txt'], path: 'gone.txt' }))
    expect(error.code).toBe('missing')
    expect(error.status).toBe(404)
  })

  test('a NUL byte in the path is refused', () => {
    const error = refusal(() => readArtifactText({ base, declaredPaths: ['a\0b'], path: 'a\0b' }))
    expect(error.code).toBe('path_escape')
  })

  test('no project root means no preview, not a crash', () => {
    const error = refusal(() => readArtifactText({ base: undefined, declaredPaths: ['notes/ok.txt'], path: 'notes/ok.txt' }))
    expect(error.code).toBe('no_project')
    expect(error.status).toBe(400)
  })
})

describe('describing declared artifacts', () => {
  test('reports file, directory, missing and escape kinds', () => {
    expect(describeArtifact(base, 'notes/ok.txt')).toEqual({ path: 'notes/ok.txt', kind: 'file', bytes: 12 })
    expect(describeArtifact(base, 'folder').kind).toBe('dir')
    expect(describeArtifact(base, 'gone.txt').kind).toBe('missing')
    expect(describeArtifact(base, '../outside.txt').kind).toBe('escape')
    expect(describeArtifact(base, outside).kind).toBe('escape')
  })

  test('degrades to missing without a project root', () => {
    expect(artifactBase({ projectRoot: undefined })).toBeUndefined()
    expect(describeArtifact(undefined, 'notes/ok.txt').kind).toBe('missing')
  })
})
