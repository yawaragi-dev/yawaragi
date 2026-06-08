import 'server-only'

/**
 * A tiny `KVClient` interface that the `anonymousRateLimit` module talks to.
 *
 * The contract is deliberately minimal — three operations cover the
 * sliding-window rate-limit algorithm without committing to a specific
 * Redis dialect or vendor SDK. Implementations live alongside this file:
 *
 *  - `upstash-kv-client.ts` — the production wiring, talks to Upstash
 *    Redis over its REST API (no SDK dependency; just `fetch`).
 *  - `in-memory-kv-client.ts` — used by the rate-limit unit tests so we
 *    can drive deterministic state transitions without a network or a
 *    container.
 *
 * The sliding-window algorithm we use stores one sorted-set per
 * identifier+bucket where the score is the request timestamp. To bound
 * the budget the limiter calls `zRemoveOlderThan` (drop the entries that
 * have aged out of the window), `zCount` (read the current count) and
 * `zAdd` (record the new request). Window TTL is applied on every write
 * via `expire` so abandoned sessions garbage-collect in 24h.
 */
export interface KVClient {
  /**
   * Add `member` to the sorted set under `key`, scored by `score`
   * (typically the request timestamp in ms epoch). The member must be
   * unique across calls — the production rate-limiter pairs `score`
   * with a per-call random suffix to avoid duplicate-member rejection.
   */
  zAdd(key: string, score: number, member: string): Promise<void>
  /**
   * Drop every member of the sorted set under `key` whose score is
   * `< olderThan`. Used to age out entries older than the sliding
   * window edge.
   */
  zRemoveOlderThan(key: string, olderThan: number): Promise<void>
  /**
   * Count members of the sorted set under `key` whose score is in
   * `[min, max]` inclusive. Used to read the current request count
   * inside the live window.
   */
  zCount(key: string, min: number, max: number): Promise<number>
  /**
   * Set the TTL for `key` in seconds. Idempotent — calling after each
   * write keeps the key alive while there's activity and lets it
   * garbage-collect after `ttlSeconds` of silence.
   */
  expire(key: string, ttlSeconds: number): Promise<void>
}
