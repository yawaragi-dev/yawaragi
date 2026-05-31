import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      // pnpm strict isolation hides the `server-only` package (a transitive
      // of `next`) from the vitest runner. Modules that ship with
      // `import 'server-only'` would otherwise fail Vite's import-analysis
      // before vitest's `vi.mock('server-only', () => ({}))` ever runs.
      // The stub is an empty CJS shim — `server-only` itself has no
      // runtime surface, it exists only to throw if pulled into a
      // client bundle, which doesn't apply inside vitest.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    exclude: ['e2e/**', 'node_modules/**', '.next/**', '.claude/**', '**/*.integration.test.ts'],
  },
})
