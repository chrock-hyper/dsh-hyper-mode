import { defineConfig } from 'tsdown'

/** One plugin package the build script can emit. */
export interface PackageBuild {
  /** Absolute package directory; tsdown resolves `src/` relative to it. */
  dir: string
  /** Package name; the Client wrapper registers this as the module-table id. */
  name: string
  /** Host entry points, relative to the package: `{ index: 'src/index.ts', … }`. */
  entries: Record<string, string>
}

/**
 * Host half: ESM entries, Node platform, declarations beside the output.
 *
 * `@deepseek-ai/*` stays external. The profile resolver routes a linked
 * importer's bare request to the installation copy when that package declares
 * the request in `peerDependencies`; bundling a copy would defeat that and
 * hand the Host a second Cordis or Schemastery instance. This bundle loads
 * them through `loadShipped` at call time instead of importing them, but the
 * rule stays: never inline a shipped package.
 */
export function hostConfig(pkg: PackageBuild) {
  return defineConfig({
    cwd: pkg.dir,
    entry: pkg.entries,
    format: ['esm'],
    platform: 'node',
    outDir: 'lib',
    // The Client build writes into the same directory; only `clean` decides.
    clean: false,
    sourcemap: true,
    dts: { tsc: { eager: true } },
    // Keep `lib/index.js` / `lib/index.d.ts`; DSH resolves plain .js entries.
    fixedExtension: false,
    deps: {
      // A shipped package is never inlined: the profile resolver routes the
      // bare request to the installation copy, and inlining would hand the
      // Host a second Cordis or Schemastery instance.
      neverBundle: [/^@deepseek-ai\//],
      // `@chrock-hyper/dsh-hyper-shared` is source-only: it has no build step
      // of its own, so each plugin inlines this small pure library instead of
      // importing TypeScript at runtime.
      alwaysBundle: [/^@chrock-hyper\/dsh-hyper-shared/],
    },
  })
}

/**
 * Client half: one CJS chunk wrapped in the page module table's registration
 * call.
 *
 * The page never imports a client bundle. It fetches the file as a script and
 * expects `window.__ModuleLoader__.load({ id, factory })`, where `factory`
 * runs lazily and returns the plugin object. CJS maps onto that shape with no
 * shimming. `require` targets stay on the page's baseline: `react` and
 * `react/jsx-runtime`.
 */
export function clientConfig(pkg: PackageBuild) {
  const openLoader = [
    '/* Bundled by tsdown, then wrapped for the DSH client module table. */',
    `window.__ModuleLoader__.load({ id: ${JSON.stringify(pkg.name)}, factory(require) {`,
    'var module = { exports: {} };',
    'var exports = module.exports;',
  ].join('\n')

  const closeLoader = ['return module.exports;', '} });', ''].join('\n')

  return defineConfig({
    cwd: pkg.dir,
    entry: { client: 'src/client/index.tsx' },
    format: ['cjs'],
    // CJS always targets Node.js unless told otherwise; this bundle is browser-only.
    platform: 'neutral',
    inputOptions: { platform: 'browser' },
    target: 'es2022',
    outDir: 'lib',
    clean: false,
    sourcemap: true,
    dts: { tsc: { eager: true } },
    // Keep `lib/client.js`. This file is served to the page and run as a
    // script; Node never imports it, so the `.cjs` safety extension buys
    // nothing here.
    outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
    banner: `${openLoader}\n`,
    footer: `\n${closeLoader}`,
    deps: {
      neverBundle: ['react', 'react-dom', 'react/jsx-runtime'],
    },
  })
}
