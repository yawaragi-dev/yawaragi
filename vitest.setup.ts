import { vi } from 'vitest'

// Env-var stubs — add real values in .env.test if needed
process.env.NEXT_PUBLIC_APP_URL ??= 'http://localhost:3000'

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
