import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: ['node_modules/', 'dist/', 'examples/', 'tests/', '*.config.*', 'src/**/*.d.ts'],
    },
    include: ['tests/**/*.spec.ts'],
    exclude: ['node_modules/', 'dist/'],
  },
})
