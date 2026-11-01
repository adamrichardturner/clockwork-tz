import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

export default defineConfig({
  define: {
    __VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/tzdb/data.generated.ts'],
      reporter: ['text', 'json', 'html', 'lcov'],
    },
    include: ['tests/**/*.spec.ts'],
    exclude: ['node_modules/', 'dist/'],
  },
})
