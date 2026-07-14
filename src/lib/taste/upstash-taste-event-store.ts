import 'server-only'

import type { TasteEvent } from '@/lib/schemas/taste-event'
import {
  MAX_TASTE_EVENTS,
  TASTE_STORE_TTL_SECONDS,
  type TasteEventStore,
  parseStoredEvents,
  tasteEventKey,
} from '@/lib/taste/taste-event-store'

/**
 * Production {@link TasteEventStore} backed by Upstash Redis over its REST API.
 *
 * Same rationale as the rate-limiter's `UpstashKVClient`: talk to the REST
 * endpoint directly with `fetch` rather than add the `@upstash/redis` SDK,
 * which would mean weakening the pnpm `minimumReleaseAge` quarantine for one
 * dependency. The integration seam is the `TasteEventStore` interface, so a
 * vendor swap is a file change, not a refactor.
 *
 * Storage shape: a Redis LIST per session (`taste:<sid>`), one JSON-encoded
 * TasteEvent per element. Append is `RPUSH` + `LTRIM -max -1` (bound to the
 * most recent N, server-side, no read-modify-write race) + `EXPIRE` (refresh
 * TTL). Read is `LRANGE 0 -1`. This is why the store uses a list rather than a
 * single JSON blob under `GET`/`SET`: concurrent appends within a session stay
 * race-free.
 */
export class UpstashTasteEventStore implements TasteEventStore {
  private readonly maxEvents: number
  private readonly ttlSeconds: number

  constructor(
    private readonly restUrl: string,
    private readonly restToken: string,
    private readonly fetchImpl: typeof fetch = fetch,
    options: { maxEvents?: number; ttlSeconds?: number } = {},
  ) {
    this.maxEvents = options.maxEvents ?? MAX_TASTE_EVENTS
    this.ttlSeconds = options.ttlSeconds ?? TASTE_STORE_TTL_SECONDS
  }

  async read(sid: string): Promise<TasteEvent[]> {
    const result = await this.exec(['LRANGE', tasteEventKey(sid), '0', '-1'])
    if (!Array.isArray(result)) return []
    return parseStoredEvents(result.filter((item): item is string => typeof item === 'string'))
  }

  async append(sid: string, event: TasteEvent): Promise<void> {
    const key = tasteEventKey(sid)
    await this.exec(['RPUSH', key, JSON.stringify(event)])
    // Keep only the most recent `maxEvents` elements (negative indices count
    // from the tail): LTRIM key -maxEvents -1.
    await this.exec(['LTRIM', key, `-${this.maxEvents}`, '-1'])
    await this.exec(['EXPIRE', key, this.ttlSeconds.toString()])
  }

  async clear(sid: string): Promise<void> {
    await this.exec(['DEL', tasteEventKey(sid)])
  }

  private async exec(command: ReadonlyArray<string>): Promise<unknown> {
    const response = await this.fetchImpl(this.restUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.restToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(command),
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`Upstash REST error ${response.status} for command ${command[0]}`)
    }
    const json: unknown = await response.json()
    if (typeof json === 'object' && json !== null && 'result' in json) {
      return (json as { result: unknown }).result
    }
    return null
  }
}
