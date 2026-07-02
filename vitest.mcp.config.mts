import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

/**
 * Dedicated config for the live `@yawaragi/sakenowa-mcp` integration
 * suite. Differs from `vitest.integration.config.mts` in that we DO NOT
 * spin up a testcontainers Postgres — the live sakenowa-mcp the
 * maintainer started already has its own DB. Run via:
 *
 *   pnpm test:mcp-integration
 *
 * The MCP suite is auto-skipped when `MCP_SAKENOWA_URL` is unset or
 * points at the CI sentinel, so this config doesn't enforce env
 * presence; it just makes the test file discoverable (the unit config
 * excludes `*.integration.test.ts` to keep `pnpm test` fast).
 */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    include: ['**/mcp-live.integration.test.ts'],
    exclude: ['node_modules/**', '.next/**', '.claude/**'],
    setupFiles: ['./vitest.setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
})
