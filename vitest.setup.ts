import { vi } from 'vitest'

// Env-var stubs — add real values in .env.test if needed
process.env.NEXT_PUBLIC_APP_URL ??= 'http://localhost:3000'

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
