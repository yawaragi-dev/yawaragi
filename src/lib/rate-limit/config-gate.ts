/**
 * Validates that the four rate-limit env vars are all present (or all
 * absent in non-production) and returns a typed bundle for the
 * enforcement path. Extracted from `scan-action.ts` so the production
 * fail-closed behaviour is unit-testable per-variable instead of
 * relying on E2E (which never sees `NODE_ENV === 'production'` and
 * therefore cannot exercise the throw branch — see #114 self-review).
 *
 * The four keys are interdependent: missing any one is the same kind
 * of misconfiguration, and partial enforcement is worse than no
 * enforcement (a deploy where the cookie is signed but the KV is
 * unreachable would silently allow every scan). So we treat them as
 * one bundle and fail at the first missing key.
 */

export interface RateLimitConfig {
  /** HMAC key for the `yawaragi_session` cookie. 32+ chars. */
  secret: string
  /** Rotating salt mixed into the SHA-256 hash of the visitor's IP. 16+ chars. */
  salt: string
  /** Upstash Redis REST endpoint (https://...upstash.io). */
  kvUrl: string
  /** Upstash Redis REST bearer token. */
  kvToken: string
}

/**
 * Partial shape — what we have when `env.parse` has succeeded but the
 * four rate-limit fields are `.optional()` and may or may not be set.
 */
export interface PartialRateLimitConfig {
  secret: string | undefined
  salt: string | undefined
  kvUrl: string | undefined
  kvToken: string | undefined
}

/** Ordered list of the four required keys — used for the throw message. */
const REQUIRED_KEYS = [
  ['secret', 'SESSION_COOKIE_SECRET'],
  ['salt', 'IP_HASH_SALT'],
  ['kvUrl', 'UPSTASH_REDIS_REST_URL'],
  ['kvToken', 'UPSTASH_REDIS_REST_TOKEN'],
] as const

export class RateLimitConfigError extends Error {
  /** Names of the env vars that were missing — useful for tests and ops. */
  readonly missingKeys: ReadonlyArray<string>
  constructor(missingKeys: ReadonlyArray<string>) {
    super(
      `Rate-limit configuration missing in production — set ${missingKeys.join(
        ', ',
      )}.`,
    )
    this.name = 'RateLimitConfigError'
    this.missingKeys = missingKeys
  }
}

/**
 * @param partial — the four env values (each possibly undefined)
 * @param isProd — whether to throw on missing keys (true) or return null (false)
 * @returns the typed `RateLimitConfig` when all four are present;
 *          `null` when at least one is missing AND `isProd` is false
 *          (the caller is responsible for logging the dev-skip warning)
 * @throws `RateLimitConfigError` when at least one is missing AND `isProd` is true
 */
export function assertRateLimitConfig(
  partial: PartialRateLimitConfig,
  isProd: boolean,
): RateLimitConfig | null {
  const missing: string[] = []
  for (const [field, envName] of REQUIRED_KEYS) {
    if (!partial[field]) missing.push(envName)
  }
  if (missing.length === 0) {
    // All present — type-narrow to the non-undefined shape.
    return {
      secret: partial.secret as string,
      salt: partial.salt as string,
      kvUrl: partial.kvUrl as string,
      kvToken: partial.kvToken as string,
    }
  }
  if (isProd) throw new RateLimitConfigError(missing)
  return null
}
