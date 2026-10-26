// Smoke test against a PRODUCTION build (`next build` + `next start`).
//
// Every other Playwright spec runs against `pnpm dev`, which renders every
// route dynamically. A route that only breaks once Next decides it is static —
// #518: `generateStaticParams` on /learn/[slug] under a layout that reads
// cookies() and the Clerk session, so every entry answered 500 in production
// with DYNAMIC_SERVER_USAGE — passes the whole dev suite. This config serves
// the already-built `.next` and loads a handful of key routes (e2e/smoke-prod).
//
// Run `pnpm build` first, then `pnpm test:smoke`. CI does both in the verify
// job, reusing the build it already makes.
import { defineConfig } from '@playwright/test'

const PORT = Number(process.env.SMOKE_PORT ?? 3014)
const BASE_URL = `http://localhost:${PORT}`

function definedEnvOnly(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === 'string') out[k] = v
  }
  return out
}

export default defineConfig({
  testDir: './e2e',
  testMatch: 'smoke-prod.spec.ts',
  // A production server answers in milliseconds; a retry would only hide a
  // flake (see the "no flaky tests" rule), so there are none.
  retries: 0,
  use: {
    baseURL: BASE_URL,
    channel: 'chrome',
  },
  webServer: {
    command: `pnpm start --port ${PORT}`,
    url: `${BASE_URL}/api/offline/en`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      // `src/instrumentation.ts` runs the production boot gate: it needs the
      // four rate-limit values and throws if RATE_LIMIT_BYPASS=1. Dummies by
      // default (the Upstash host is under RFC 2606's `.invalid`, so it never
      // resolves; usage counts fail quietly after the response). A real value
      // already in the environment wins.
      SESSION_COOKIE_SECRET: 'smoke-only-dummy-session-cookie-secret-32+',
      IP_HASH_SALT: 'smoke-only-dummy-ip-salt',
      UPSTASH_REDIS_REST_URL: 'https://upstash.example.invalid',
      UPSTASH_REDIS_REST_TOKEN: 'smoke-only-dummy-upstash-token',
      ...definedEnvOnly(),
      // Never the bypass: production refuses to start with it. '0' rather
      // than unset, so a RATE_LIMIT_BYPASS=1 in .env.local cannot fill it in
      // (Next's env loading does not override a variable already set).
      RATE_LIMIT_BYPASS: '0',
      NODE_ENV: 'production',
    },
  },
})
