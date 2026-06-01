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

// `server-only` is a marker package shipped with Next.js (transitive of `next`)
// that throws if a module imports it from a client bundle. It has no runtime
// behaviour in a server context — just empty exports. pnpm's strict isolation
// means our app code can't reach the transitive directly from the vitest
// runner, so we mock it as a no-op. Without this, any test that imports a
// `import 'server-only'` module (lookup.ts, server-client.ts, …) fails to
// resolve the package.
vi.mock('server-only', () => ({}))

// next/navigation — components that call useRouter/usePathname won't error in tests
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
  notFound: vi.fn(),
}))
