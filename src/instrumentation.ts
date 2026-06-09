/**
 * Next.js 16 instrumentation hook — runs once per server cold start
 * (Node.js runtime only; Edge cold starts call `register()` from the
 * Edge runtime branch). We use it to fail-closed at deploy time when
 * the rate-limit env is misconfigured in production.
 *
 * Why this matters: without the boot-time gate, a misconfigured
 * Production deploy would build successfully (the four rate-limit env
 * vars are `.optional()` in `src/env.ts`) and only fail at the first
 * scan request — which might be hours after deploy, surfacing as a
 * support ticket rather than a build alarm. The boot-time gate
 * converts a per-request failure into a cold-start failure, which
 * Vercel surfaces loudly in the deployment view.
 *
 * Only fires when `NODE_ENV === 'production'`. Dev / test / preview-
 * with-missing-env all keep working without the rate-limit module
 * configured.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
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
  )
}
