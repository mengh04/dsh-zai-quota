/**
 * Build the browser half (lib/client.js): a CJS factory seated through the
 * module-table handoff `window.__ModuleLoader__.load({ id, factory })`.
 * The baseline (React, Cordis, client/store, ui-primitives, ui-slots,
 * ui-dockkit) stays external — the shell seeds those identities in the static
 * module table, so the bundle requires them instead of inlining copies.
 * CSS modules are inlined as a hashed class map plus one runtime style tag,
 * matching what the shipped Web shell serves for dynamic client packages.
 */
import { build } from 'esbuild'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'

const ID = '@deepseek-ai/dsh-client-ui-zai-quota'

const BASELINE = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-dockkit',
]

/**
 * Inline one CSS module: hash-suffix every local class (in both the sheet and
 * the exported map) so independently built plugins never collide.
 * @param path - the .module.css file to inline.
 * @returns JS module source exporting the class map and injecting the sheet.
 */
function inlineCssModule(path) {
  const sheet = readFileSync(new URL(path, import.meta.url), 'utf8')
  const suffix = createHash('sha1').update(sheet).digest('hex').slice(0, 8)
  const names = [...new Set([...sheet.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)].map(m => m[1]))]
  const map = {}
  let renamed = sheet
  for (const name of names) {
    map[name] = `${name}_${suffix}`
    renamed = renamed.replace(new RegExp(`\\.${name}(?![A-Za-z0-9_-])`, 'g'), `.${name}_${suffix}`)
  }
  return [
    `const map = ${JSON.stringify(map)};`,
    `{`,
    `\tconst tag = document.createElement("style");`,
    `\ttag.textContent = ${JSON.stringify(renamed)};`,
    `\tdocument.head.appendChild(tag);`,
    `}`,
    `export default map;`,
  ].join('\n')
}

const cssModule = {
  name: 'inline-css-module',
  setup(builder) {
    builder.onResolve({ filter: /\.module\.css$/ }, args => ({
      path: resolvePath(args.resolveDir, args.path),
      namespace: 'css-module',
    }))
    builder.onLoad({ filter: /.*/, namespace: 'css-module' }, args => ({
      contents: inlineCssModule(args.path),
      loader: 'js',
    }))
  },
}

await build({
  entryPoints: ['src/client/index.ts'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2024',
  sourcemap: true,
  external: BASELINE,
  plugins: [cssModule],
  banner: {
    js: `window.__ModuleLoader__.load({\n\tid: ${JSON.stringify(ID)},\n\tfactory: (require) => {\n\t\tvar module = { exports: {} };\n\t\tvar exports = module.exports;\n\t\tObject.defineProperty(exports, Symbol.toStringTag, { value: "Module" });`,
  },
  footer: { js: '\t\treturn module.exports;\n\t}\n});' },
})
console.log(`built lib/client.js for ${ID}`)
