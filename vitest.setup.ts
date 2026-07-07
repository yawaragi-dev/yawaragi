import { vi } from 'vitest'

// Env-var stubs — add real values in .env.test if needed
process.env.NEXT_PUBLIC_APP_URL ??= 'http://localhost:3000'
// CRON_SECRET is required (min 16) per src/env.ts since #54 made it
// non-optional. Tests that import the env module need a value at
// validation time; route auth tests override this with their own
// stub-injected expected secret via the test seam.
process.env.CRON_SECRET ??= 'test-cron-secret-32-bytes-of-padding'

// Clerk keys are required (.min(1)) per src/env.ts since #55. Use a
// truthy-check (not ??=) so the placeholder also fires when GitHub
// Actions injects an empty-string env var from a missing or unset
// secret — `??=` treats "" as defined and would let the bare ZodError
// through. E2Es and production set real pk_test_ / sk_test_ values
// from the Clerk dashboard.
if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = 'pk_test_placeholder-for-unit-tests'
}
if (!process.env.CLERK_SECRET_KEY) {
  process.env.CLERK_SECRET_KEY = 'sk_test_placeholder-for-unit-tests'
}

// ANTHROPIC_API_KEY tightened to .min(1) by S3 (#108). Unit tests never
// reach the real Anthropic endpoint — the vision provider tests inject a
// `MockLanguageModelV3` — but the env.parse still runs at module load,
// so any test that touches a module which transitively imports `@/env`
// needs a truthy value here. Same truthy-not-defined check as the Clerk
// stubs above so an injected empty string is replaced.
if (!process.env.ANTHROPIC_API_KEY) {
  process.env.ANTHROPIC_API_KEY = 'sk-ant-test-placeholder-for-unit-tests'
}

// `server-only` is a marker package shipped with Next.js (transitive of `next`)
// that throws if a module imports it from a client bundle. It has no runtime
// behaviour in a server context — just empty exports. pnpm's strict isolation
// means our app code can't reach the transitive directly from the vitest
// runner, so we mock it as a no-op. Without this, any test that imports a
// `import 'server-only'` module (lookup.ts, server-client.ts, …) fails to
// resolve the package.
vi.mock('server-only', () => ({}))

// next/navigation — components that call useRouter/usePathname won't error in tests.
//
// This stub is ALSO reached through the transitive path
// `@/i18n/navigation → next-intl/navigation → next/navigation` because
// `next-intl` is listed in `vitest.config.mts` under
// `test.server.deps.inline`. Without inlining, next-intl loads its
// own copy of `next/navigation` from its own `node_modules` and this
// mock has no effect — a test subject that transitively imports
// `next-intl/navigation` would then need its own local
// `vi.mock('@/i18n/navigation', …)` per file. See
// `docs/agents/vitest-mocks.md` (§ "next-intl transitive gotcha").
//
// Keep this export list in sync with every symbol next-intl calls on
// `next/navigation`. Currently: redirect, permanentRedirect (both
// consumed by `createSharedNavigationFns` in
// `next-intl/dist/.../navigation/shared/createSharedNavigationFns.js`).
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: vi.fn(),
  permanentRedirect: vi.fn(),
  notFound: vi.fn(),
}))
