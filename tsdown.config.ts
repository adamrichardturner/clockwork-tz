import { readFileSync } from 'node:fs'
import { defineConfig, type UserConfig } from 'tsdown'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

const shared: UserConfig = {
  format: ['esm', 'cjs'],
  dts: true,
  platform: 'neutral',
  target: 'es2020',
  outDir: 'dist',
  define: {
    __VERSION__: JSON.stringify(pkg.version),
  },
}

export default defineConfig([
  { ...shared, entry: ['src/index.ts'], sourcemap: true, clean: true },
  // Generated data: source maps would only duplicate it
  { ...shared, entry: ['src/tzdb.ts'], sourcemap: false, dts: { sourcemap: false }, clean: false },
])
