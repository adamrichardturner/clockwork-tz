import { defineConfig } from 'tsup'

export default defineConfig([
  // Standard build for npm (with external dependencies)
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    treeshake: true,
    splitting: false,
    minify: false,
    target: 'es2020',
    outDir: 'dist',
    external: ['date-fns', 'date-fns-tz'],
    noExternal: [],
    platform: 'neutral',
    env: {
      NODE_ENV: 'production',
    },
  },
  // Browser build for CDN (with bundled dependencies)
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    sourcemap: true,
    treeshake: true,
    splitting: false,
    minify: true,
    target: 'es2020',
    outDir: 'dist',
    outExtension: () => ({ js: '.browser.js' }),
    external: [], // Bundle all dependencies
    noExternal: ['date-fns', 'date-fns-tz'],
    platform: 'browser',
    env: {
      NODE_ENV: 'production',
    },
    define: {
      'process.env.NODE_ENV': '"production"',
    },
  },
])
