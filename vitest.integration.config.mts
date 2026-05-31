import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // Mirror the unit-suite stub so integration tests can import
      // server-only modules (e.g. lookup.ts) without Vite's
      // import-analysis tripping over the missing transitive.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    // Only co-located *.integration.test.ts files; the main vitest.config.ts
    // excludes them so `pnpm test` stays fast.
    include: ['**/*.integration.test.ts'],
    exclude: ['e2e/**', 'node_modules/**', '.next/**', '.claude/**'],
    setupFiles: ['./vitest.setup.ts'],
    globalSetup: ['./tests/integration/setup.ts'],
    // Testcontainers spin-up is slow (~5–10s); allow generous per-test budget.
    testTimeout: 30000,
    hookTimeout: 60000,
    // Single-threaded: the testcontainer is shared; parallel files would race.
    fileParallelism: false,
  },
})
