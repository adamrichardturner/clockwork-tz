import { readFileSync } from 'node:fs'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string
}

// Specs that only use the public API, so they also run in real browsers
const PORTABLE_SPECS = [
  'tests/zones.spec.ts',
  'tests/disambiguation.spec.ts',
  'tests/format.spec.ts',
  'tests/parse.spec.ts',
  'tests/transitions.spec.ts',
  'tests/list.spec.ts',
]

export default defineConfig({
  define: {
    __VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/tzdb/data.generated.ts'],
      reporter: ['text', 'json', 'html', 'lcov'],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 75,
        statements: 85,
      },
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['tests/**/*.spec.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          include: PORTABLE_SPECS,
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }, { browser: 'firefox' }, { browser: 'webkit' }],
          },
        },
      },
    ],
  },
})
