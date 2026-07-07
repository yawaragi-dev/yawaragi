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
    server: {
      deps: {
        // Inline `next-intl` so Vite (and therefore vitest's mock
        // hoister) transforms its ESM instead of letting Node load it
        // from `node_modules` as an externalised dependency. Without
        // this, `next-intl/navigation` imports `next/navigation` from
        // its own `node_modules` copy — Vite's import graph never sees
        // the resolution, and the top-level `vi.mock('next/navigation',
        // …)` in `vitest.setup.ts` has no effect on the transitive
        // path. Test subjects that reach `@/i18n/navigation` would
        // then have to redeclare a local `vi.mock('@/i18n/navigation',
        // …)` each time. See `docs/agents/vitest-mocks.md` for the
        // full write-up (issue #171).
        inline: ['next-intl'],
      },
    },
  },
})
