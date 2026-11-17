/** Remove per-package build output and local scratch state. */
import { readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const packagesDir = join(root, 'packages')

for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  rmSync(join(packagesDir, entry.name, 'lib'), { recursive: true, force: true })
}
rmSync(join(root, '.tmp'), { recursive: true, force: true })

console.log('cleaned package build output and .tmp')
