import { defineConfig } from 'tsdown'

/** Node-only host half, built straight from source. */
export default defineConfig({
  name: '@deepseek-ai/dsh-host-zai-quota',
  entry: { index: 'src/index.ts', shared: 'src/shared.ts' },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  // Keep the emitted filenames aligned with package.json's ".js" exports.
  fixedExtension: false,
  dts: true,
  clean: true,
  external: ['@deepseek-ai/schemastery', '@deepseek-ai/dsh-credentials', '@deepseek-ai/cordis'],
})
