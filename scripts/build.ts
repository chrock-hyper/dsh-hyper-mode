/**
 * Build every plugin package in the monorepo.
 *
 * Package layout:
 *   packages/<name>/src/index.ts        Host entry (required for a plugin row)
 *   packages/<name>/src/client/index.tsx Client entry (only with dsh.client)
 *   packages/<name>/lib/                Build output, gitignored
 *
 * Any other `src/<entry>.ts` at the package root becomes a second Host entry
 * (today: `src/internal.ts`, the seam `hyper-org` imports from `hyper-roles`).
 *
 * The bundle package has no Host or Client code: it only contributes a patch,
 * so it is skipped here.
 */
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { build } from 'tsdown'

import { clientConfig, hostConfig } from '../build/config.ts'

interface Manifest {
  name: string
  exports?: Record<string, unknown>
  dsh?: {
    bundle?: { patch?: string | string[] }
    client?: { platform?: string }
  }
}

const root = fileURLToPath(new URL('..', import.meta.url))
const packagesDir = join(root, 'packages')
const only = process.argv.slice(2).filter((argument) => !argument.startsWith('-'))
let built = 0

for (const entry of readdirSync(packagesDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
  if (!entry.isDirectory()) continue
  const dir = join(packagesDir, entry.name)
  const manifestPath = join(dir, 'package.json')
  if (!existsSync(manifestPath)) continue

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest
  // A bundle package is pure composition: patch, locale, docs, icon.
  if (manifest.dsh?.bundle?.patch !== undefined) continue
  // A bare package filter (`pnpm build hyper-wiki`) builds only what you name.
  if (only.length > 0 && !only.includes(entry.name)) continue

  const hasHost = existsSync(join(dir, 'src/index.ts'))
  const hasClient = manifest.dsh?.client !== undefined
  const hasClientEntry = existsSync(join(dir, 'src/client/index.tsx'))
  if (!hasHost && !hasClient) continue
  // The Client halves migrate in their own wave; until a package has
  // `src/client/index.tsx` its declared `dsh.client` still points at the
  // hand-written classic script, which this build does not touch.
  if (hasClient && !hasClientEntry) {
    console.warn(`skip ${manifest.name}: client half is not migrated to TSX yet`)
  }

  rmSync(join(dir, 'lib'), { recursive: true, force: true })
  // Entries are exactly the public Host entry points: `src/index.ts` plus one
  // file per extra export that maps to `./lib/<name>.js` (today: `internal`).
  // Enumerating every top-level module would emit bundles nobody imports and
  // duplicate the code the entry already carries.
  const entries: Record<string, string> = {}
  for (const [key, target] of Object.entries(manifest.exports ?? {})) {
    if (!key.startsWith('./') || key === './client') continue
    const file = typeof target === 'string' ? /^\.\/lib\/([A-Za-z0-9_-]+)\.js$/.exec(target) : undefined
    const name = file?.[1]
    if (name === undefined) continue
    if (existsSync(join(dir, 'src', `${name}.ts`))) entries[name] = `src/${name}.ts`
  }
  if (existsSync(join(dir, 'src/index.ts')) && entries.index === undefined) entries.index = 'src/index.ts'
  const pkg = { dir, name: manifest.name, entries }

  if (hasHost) {
    console.log(`build ${manifest.name}: host (${Object.keys(pkg.entries).join(', ')})`)
    await build(hostConfig(pkg))
  }
  if (hasClientEntry) {
    console.log(`build ${manifest.name}: client`)
    await build(clientConfig(pkg))
  }
  built += 1
}

console.log(`built ${built} plugin package(s).`)
