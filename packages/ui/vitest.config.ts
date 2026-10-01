import { defineConfig } from 'vitest/config'

/**
 * `@clairvoyant/ui` tests run against the compiled `dist/` output (the same
 * convention as before), so `test` builds first. Static render tests run in the
 * `node` environment; DOM interaction tests opt into jsdom per file with a
 * `// @vitest-environment jsdom` docblock.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./test/setup.ts'],
    passWithNoTests: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}'],
      reporter: ['text'],
    },
  },
})
