/** Build the node half (lib/index.js): an empty apply the Loader can import. */
import { build } from 'esbuild'

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'es2024',
  sourcemap: false,
})
console.log('built lib/index.js')
