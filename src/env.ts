import { z } from 'zod'

/**
 * Every field is `.optional()` by default. When a vendor is wired up, the
 * PR that introduces the integration tightens the relevant field(s) back to
 * a required shape so the missing-secret failure happens at import time,
 * not at the first runtime call.
 *
 * `empty()` adapts `.env*` files where unset keys land as empty strings
 * (`LANGFUSE_HOST=`) — Zod's plain `.optional()` would still validate `""`
 * against `.url()` / `.min(N)` and reject it. We treat empty as undefined.
 */
const empty = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' ? undefined : v), schema)

const Env = z.object({
  ANTHROPIC_API_KEY: empty(z.string().optional()),
  // Postgres connection string for the Supabase project (Project → Settings →
  // Database → Connection string). Used by the pg.Pool in server-client.ts.
  // Stays optional in the schema so the app boots without it; the pool
  // constructor throws at first use with a clear message.
  DATABASE_URL: empty(z.string().url().optional()),
  NEXT_PUBLIC_SUPABASE_URL: empty(z.string().url().optional()),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: empty(z.string().optional()),
  SUPABASE_SERVICE_ROLE_KEY: empty(z.string().optional()),
  // Tightened to required by Slice 12 (#55). `<ClerkProvider>` (root
  // layout) and `clerkMiddleware` (src/proxy.ts) both fail with cryptic
  // runtime errors when these are missing; failing at env.parse keeps
  // the failure mode obvious in dev + CI.
  CLERK_SECRET_KEY: empty(z.string().min(1)),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: empty(z.string().min(1)),
  LANGFUSE_PUBLIC_KEY: empty(z.string().optional()),
  LANGFUSE_SECRET_KEY: empty(z.string().optional()),
  LANGFUSE_HOST: empty(z.string().url().optional()),
  // Shared secret for the /api/cron/ingest route (#54). Required
  // because the route is the only auth gate — a missing secret would
  // either crash the route at first request or, worse, fall through to
  // an open endpoint. `min(16)` is the entropy floor for a shared
  // secret used as `Bearer <secret>`: 16 random URL-safe chars give
  // ~95 bits of entropy, well past brute-force range for a route that
  // legitimately fires once an hour. Rotate by changing the env var
  // (Vercel / hosting platform) — no code change required (US #32).
  CRON_SECRET: empty(z.string().min(16)),
  // -------- Phase 3 / S2 — anonymous session + rate limit (#107) --------
  // HMAC secret for the `yawaragi_session` cookie. The cookie's `sid`
  // is the rate-limit budget key; a forged `sid` is a free budget
  // reset, so the signature must hold. `min(32)` is the floor for a
  // ~192-bit secret — comfortably past brute-force. Optional in the
  // schema so the app boots without it; the scan action throws at
  // first use with a clear "set SESSION_COOKIE_SECRET" message in
  // production.
  SESSION_COOKIE_SECRET: empty(z.string().min(32).optional()),
  // SHA-256 salt for the transient IP hash used as the second
  // rate-limit identifier. Rotated server-side without notice; never
  // shipped to clients; never written to KV alongside the hash (so
  // even a KV snapshot can't be reversed to plaintext IPs). `min(16)`
  // gives the rotating salt enough entropy to resist precomputation.
  IP_HASH_SALT: empty(z.string().min(16).optional()),
  // Upstash Redis REST endpoint + bearer token. The rate-limit
  // module hits this URL via fetch — we deliberately do NOT depend on
  // the `@upstash/redis` SDK so the 14-day npm quarantine
  // (pnpm-workspace.yaml `minimumReleaseAge`) doesn't have to be
  // weakened for a single dep. Region: EU (set when provisioning the
  // Upstash database). DPA: see ADR-0009 RoPA — pending signature
  // before Production deployment.
  UPSTASH_REDIS_REST_URL: empty(z.string().url().optional()),
  UPSTASH_REDIS_REST_TOKEN: empty(z.string().optional()),
})
export const env = Env.parse(process.env)
