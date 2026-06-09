import 'server-only'

import type { KVClient } from './kv-client'

/**
 * Production `KVClient` backed by Upstash Redis over its REST API.
 *
 * Why REST and not the official `@upstash/redis` SDK:
 *  - pnpm-workspace.yaml enforces a 14-day `minimumReleaseAge` quarantine
 *    on every new package (anti-Shai-Hulud). Adding the SDK means
 *    weakening that for one dep. Talking to the REST endpoint directly
 *    avoids the dep entirely — Upstash's REST surface is small, stable,
 *    and well-documented.
 *  - The REST API runs on every Vercel runtime (Edge + Node) without an
 *    install-script approval entry in `allowBuilds`.
 *  - The integration seam is the `KVClient` interface, not the SDK.
 *    Switching to a different vendor (Vercel KV / Cloudflare KV) is a
 *    file swap, not a refactor.
 *
 * Upstash's REST API takes commands as path-style or JSON-body. We use
 * the JSON-body form so command arguments don't have to be URL-escaped.
 * The endpoint format is documented at https://upstash.com/docs/redis/features/restapi.
 */
export class UpstashKVClient implements KVClient {
  constructor(
    private readonly restUrl: string,
    private readonly restToken: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async zAdd(key: string, score: number, member: string): Promise<void> {
    await this.exec(['ZADD', key, score.toString(), member])
  }

  async zRemoveOlderThan(key: string, olderThan: number): Promise<void> {
    // ZREMRANGEBYSCORE drops every member whose score is in
    // [-inf, olderThan). We use `(olderThan` for exclusive upper bound.
    await this.exec(['ZREMRANGEBYSCORE', key, '-inf', `(${olderThan}`])
  }

  async zCount(key: string, min: number, max: number): Promise<number> {
    const result = await this.exec(['ZCOUNT', key, min.toString(), max.toString()])
    if (typeof result === 'number') return result
    if (typeof result === 'string') return Number.parseInt(result, 10) || 0
    return 0
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.exec(['EXPIRE', key, ttlSeconds.toString()])
  }

  private async exec(command: ReadonlyArray<string>): Promise<unknown> {
    const response = await this.fetchImpl(this.restUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.restToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(command),
      // Edge runtime caches GETs by default. POSTs are not cached, but
      // we still mark this `no-store` so a future Edge upgrade doesn't
      // start serving stale rate-limit counters.
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(
        `Upstash REST error ${response.status} for command ${command[0]}`,
      )
    }
    const json: unknown = await response.json()
    if (typeof json === 'object' && json !== null && 'result' in json) {
      return (json as { result: unknown }).result
    }
    return null
  }
}
