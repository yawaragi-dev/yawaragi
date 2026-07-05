/**
 * Next.js 16 instrumentation hook — runs once per server cold start
 * (Node.js runtime only; Edge cold starts call `register()` from the
 * Edge runtime branch). Two responsibilities:
 *
 * 1. Fail-closed at deploy time when the rate-limit env is misconfigured
 *    in production. Without the boot-time gate, a misconfigured
 *    Production deploy would build successfully (the four rate-limit env
 *    vars are `.optional()` in `src/env.ts`) and only fail at the first
 *    scan request — which might be hours after deploy, surfacing as a
 *    support ticket rather than a build alarm. The gate converts a
 *    per-request failure into a cold-start failure, which Vercel
 *    surfaces loudly. Only fires when `NODE_ENV === 'production'`.
 *
 * 2. Register the OpenTelemetry SDK with the Langfuse span processor so
 *    every AI SDK 6 call wrapped with `tracedGenerateObject` /
 *    `tracedGenerateText` (see `src/lib/ai/observability/langfuse-trace.ts`)
 *    emits a Langfuse trace. Runs in every environment that has the
 *    `LANGFUSE_*` env vars set; no-ops otherwise so local dev works
 *    without Langfuse credentials.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  // OTel registration runs in all environments that have credentials.
  // The setup module is a self-contained side-effect import — calling
  // `registerOTel` once per process per Vercel's contract.
  await import('@/lib/ai/observability/otel-setup')

  if (process.env.NODE_ENV !== 'production') return

  // Lazy-imported so the dev runtime doesn't pay the import cost when
  // the gate isn't going to fire.
  const [{ env }, { assertRateLimitConfig }] = await Promise.all([
    import('@/env'),
    import('@/lib/rate-limit/config-gate'),
  ])

  // `assertRateLimitConfig` with isProd=true throws on any missing key.
  // We discard the return value here — the boot-time check is purely a
  // tripwire; the per-request enforcement path re-reads env at request
  // time so a future env reload (e.g. Vercel preview swap) is picked up.
  assertRateLimitConfig(
    {
      secret: env.SESSION_COOKIE_SECRET,
      salt: env.IP_HASH_SALT,
      kvUrl: env.UPSTASH_REDIS_REST_URL,
      kvToken: env.UPSTASH_REDIS_REST_TOKEN,
    },
    true,
    // A stray `RATE_LIMIT_BYPASS=1` on Production silently unmeters
    // paid-API cost protection — throw at boot so the deploy fails
    // loudly before any request is served. Dev/preview escape hatch;
    // see env.ts.
    { bypassEnabled: env.RATE_LIMIT_BYPASS === '1' },
  )
}
