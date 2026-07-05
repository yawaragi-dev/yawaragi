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
  // Tightened to required by Phase 3 / S3 (#108). The vision provider
  // (Anthropic Haiku 4.5 via AI SDK) reads the key at module load through
  // the `anthropic` provider factory; an empty/missing key is a fatal
  // mis-deploy of the only paid-LLM surface in Phase 3. Same fail-at-
  // env.parse pattern as `CLERK_SECRET_KEY` (PR #92) — keep the failure
  // mode obvious in dev + CI rather than letting it surface as a cryptic
  // 401 on first scan. Must be set in Production, Preview, and
  // Development on Vercel (see PR #92 § "tighten env check all
  // environments" memory).
  ANTHROPIC_API_KEY: empty(z.string().min(1)),
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
  // -------- Phase 3 / S3 — vision provider seam (#108) ----------------
  // Named key into the vision-provider registry. Default is
  // `anthropic-haiku-4-5`. The eventual second vendor (Phase 4-ish
  // failover slice) lands as a new registry entry + an env-var swap
  // here, not a code rewrite of the scan action. Validated against the
  // registry's known keys at first use, not at env.parse time, so a
  // new vendor can be added without first updating this schema.
  VISION_PROVIDER: empty(z.string().min(1).optional()),
  // -------- Phase 4 / S1 — MCP client registry (#139) ----------------
  // URL of the deployed `@yawaragi/sakenowa-mcp` server, reached over
  // streamable HTTP per ADR-0003 + PRD #138. `@yawaragi/sakenowa-mcp`
  // v0.1.0 ships both stdio and HTTP transports; production deploys
  // run the server with `MCP_TRANSPORT=http` on the server side
  // (Vercel serverless can't keep a stdio child process alive between
  // requests, which is why HTTP is the production-shaped option).
  // Stays `.optional()` in
  // the schema so the app boots without it on a fresh checkout; the
  // MCP-client factory throws at first use with a clear "set
  // MCP_SAKENOWA_URL" message — same runtime-first pattern as
  // `SESSION_COOKIE_SECRET`, NOT the env.parse-time fail of
  // `ANTHROPIC_API_KEY`. Required in Production + Preview on Vercel
  // before the suggest action (Phase 4 / S4 #142) ships; CI carries a
  // dummy value (see `.github/workflows/ci.yml` `env:` block) so the
  // Playwright webserver still parses env without it.
  MCP_SAKENOWA_URL: empty(z.string().url().optional()),
  // Dev/preview-only escape hatch: when set to `'1'`, the anonymous
  // rate-limit gate in scan-action + suggest-action short-circuits to
  // "allowed" without touching Upstash. Purpose: iterate on rate-
  // limited surfaces (suggest is 3/24h, scan is 5/24h) during dev
  // review without either waiting 24h, rotating IP_HASH_SALT, or
  // hand-clearing KV keys. Absence of this var is the safe default
  // (rate limit enforced). Never set on Production Vercel; safe to
  // set on Preview when you want a preview to be unmetered. The
  // production instrumentation gate does NOT check this var — it
  // still enforces the four core rate-limit env vars (`SESSION_COOKIE_SECRET`,
  // `IP_HASH_SALT`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`) —
  // so setting `RATE_LIMIT_BYPASS=1` on Production would still boot
  // and would silently unmeter the surface. Don't do that.
  RATE_LIMIT_BYPASS: empty(z.string().optional()),
})
export const env = Env.parse(process.env)
