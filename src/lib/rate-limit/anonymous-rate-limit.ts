import 'server-only'

import { randomBytes } from 'node:crypto'
import type { KVClient } from './kv-client'

/**
 * Bucket type — closed union, widen by adding a member.
 *
 * Each bucket has its own cap + window. Bucket isolation is enforced by
 * including the bucket name in the KV key, so a cap exhausted on one bucket
 * has no effect on the other. Buckets shipped so far:
 *
 *   - `vision-scan` (Phase 3 / #107): 5 calls / 24h — label scan.
 *   - `suggestions` (Phase 4 / #143): 3 calls / 24h — suggest tool loop.
 *     Lower cap than vision-scan because a suggest call fans out to multiple
 *     MCP tool invocations under the LLM's control, so per-call cost is
 *     materially higher.
 *   - `taste` (Phase 5 / #220): 60 calls / 24h — taste-event writes (rate a
 *     sake, accept a scan, seed from cross-beverage). Far higher cap than the
 *     paid-API buckets because these are cheap KV writes with no LLM/vision
 *     cost; the cap is abuse/quota protection, not cost protection.
 */
export type RateLimitBucket = 'vision-scan' | 'suggestions' | 'taste'

interface BucketConfig {
  /** Max allowed calls per identifier per window. */
  cap: number
  /** Sliding window length in seconds. */
  windowSeconds: number
}

/**
 * v1 bucket configuration. Per issue #107: 5 calls per identifier per
 * 24h sliding window for the vision-scan surface. Issue #143 adds the
 * `suggestions` bucket at 3 calls / 24h.
 *
 * Future tuning lives here, not in env (the cap is a product decision,
 * not an ops one). Env-driven tuning was considered and rejected for
 * Phase 3 — over-rotation of caps in prod is a rate-limit anti-pattern
 * (visitors hit different walls on different deploys).
 */
const BUCKET_CONFIG: Readonly<Record<RateLimitBucket, BucketConfig>> = {
  'vision-scan': {
    cap: 5,
    windowSeconds: 60 * 60 * 24,
  },
  suggestions: {
    cap: 3,
    windowSeconds: 60 * 60 * 24,
  },
  taste: {
    // Generous: a taste-event is a cheap KV write, not a paid API call. The
    // cap exists to bound scripted abuse of the write path, not per-call cost.
    cap: 60,
    windowSeconds: 60 * 60 * 24,
  },
}

export interface AnonymousRateLimitInput {
  /**
   * The signed-cookie session id (the `sid` from
   * `AnonymousSessionPayload`). One of the two budget keys; the limiter
   * denies the call when EITHER this key OR the IP-hash key has
   * exhausted its budget (whichever exhausts first wins).
   */
  cookieId: string
  /**
   * SHA-256 hash of the request IP (with the server-side rotating
   * salt). The plaintext IP must never reach this module — see
   * `hashIp` in `ip-hash.ts`.
   */
  ipHashed: string
  bucket: RateLimitBucket
}

export interface AnonymousRateLimitResult {
  allowed: boolean
  /**
   * Remaining calls under the more-constrained identifier (the lower
   * remaining count between cookie and IP). 0 means "the next call
   * will deny".
   */
  remaining: number
  /**
   * Seconds until the oldest in-window call ages out (when denied), or
   * the full window length when allowed and the budget is fresh. The
   * UI uses this to render the "try again in X" copy.
   */
  retryAfterSec: number
}

export interface AnonymousRateLimitDeps {
  kv: KVClient
  now?: () => number
  /**
   * Random suffix added to every sorted-set member so the same
   * `(cookieId, bucket, score)` tuple can be inserted multiple times
   * (Redis sorted sets dedupe by member, not score). The tests
   * inject a deterministic generator for asserting state transitions.
   */
  member?: () => string
}

/**
 * Sliding-window rate limit over two identifiers (cookie + hashed IP).
 *
 * The algorithm:
 *  1. Compute the window edge: `windowStart = now - windowSeconds * 1000`.
 *  2. For each identifier, drop entries older than `windowStart`
 *     (`zRemoveOlderThan`) and count the survivors (`zCount`).
 *  3. If EITHER count is already at the cap, return `allowed: false`
 *     with `retryAfterSec` computed from the OLDEST surviving entry's
 *     timestamp.
 *  4. Otherwise insert a new entry (`zAdd`) on BOTH identifiers and
 *     return `allowed: true` with `remaining` = cap - max(counts) - 1.
 *  5. Always re-apply `expire(key, windowSeconds)` after a write so
 *     abandoned sessions GC at the window boundary.
 *
 * Returned `remaining` is the lower of the two identifiers' remaining
 * budgets — when one identifier is more loaded than the other (the
 * normal case: same cookie, IP shared with NAT peers), the UI surfaces
 * the tighter wall.
 *
 * Bucket isolation is enforced via the KV key prefix
 * (`rl:<bucket>:cookie:<id>` and `rl:<bucket>:ip:<id>`).
 */
export async function anonymousRateLimit(
  input: AnonymousRateLimitInput,
  deps: AnonymousRateLimitDeps,
): Promise<AnonymousRateLimitResult> {
  const config = BUCKET_CONFIG[input.bucket]
  if (!config) {
    throw new Error(`Unknown rate-limit bucket: ${input.bucket}`)
  }

  const now = (deps.now ?? Date.now)()
  const windowMs = config.windowSeconds * 1000
  const windowStart = now - windowMs

  const cookieKey = `rl:${input.bucket}:cookie:${input.cookieId}`
  const ipKey = `rl:${input.bucket}:ip:${input.ipHashed}`

  await Promise.all([
    deps.kv.zRemoveOlderThan(cookieKey, windowStart),
    deps.kv.zRemoveOlderThan(ipKey, windowStart),
  ])

  const [cookieCount, ipCount] = await Promise.all([
    deps.kv.zCount(cookieKey, windowStart, now),
    deps.kv.zCount(ipKey, windowStart, now),
  ])

  // Either-or denial. Whichever identifier has already hit the cap
  // exhausts the budget; the other contributes its oldest entry for
  // the retry-after calculation.
  if (cookieCount >= config.cap || ipCount >= config.cap) {
    return {
      allowed: false,
      remaining: 0,
      // Conservative retry-after: the full window. Computing the
      // exact retry-after would mean reading the oldest surviving
      // entry of the more-loaded set; the saving (a few minutes) is
      // not worth the extra KV roundtrip on the failure path, and
      // the UI copy already uses a "try again in X hours" register
      // that's robust to over-estimation. See PRD §"Rate-limit
      // policy v1": the visitor messaging is approximate, not
      // precise, and over-reporting is fine; under-reporting is not.
      retryAfterSec: config.windowSeconds,
    }
  }

  const member = (deps.member ?? defaultMember)()
  // ZADD must land before EXPIRE — Redis EXPIRE on a non-existent key
  // is a no-op (returns 0, key stays TTL-less). Promise.all doesn't
  // guarantee wire ordering, so we await the writes first, then the
  // TTL bumps. Concurrent calls from the same identifier may still
  // race at the (zCount → zAdd) level (a Phase-4 hardening point); for
  // Phase 3 the form serialises submissions per visitor so the cap
  // stays bound tight enough.
  await Promise.all([
    deps.kv.zAdd(cookieKey, now, member),
    deps.kv.zAdd(ipKey, now, member),
  ])
  await Promise.all([
    deps.kv.expire(cookieKey, config.windowSeconds),
    deps.kv.expire(ipKey, config.windowSeconds),
  ])

  const used = Math.max(cookieCount, ipCount) + 1
  const remaining = Math.max(0, config.cap - used)

  return {
    allowed: true,
    remaining,
    retryAfterSec: config.windowSeconds,
  }
}

function defaultMember(): string {
  // 8 bytes is enough randomness to make collisions on the
  // (score, member) tuple astronomically unlikely; Redis sorted sets
  // need unique members per ZADD-or-it's-an-update.
  return randomBytes(8).toString('hex')
}
