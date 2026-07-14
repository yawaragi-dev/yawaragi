import type { TasteEvent } from '@/lib/schemas/taste-event'
import {
  MAX_TASTE_EVENTS,
  TASTE_STORE_TTL_SECONDS,
  type TasteEventStore,
} from '@/lib/taste/taste-event-store'

/**
 * In-memory {@link TasteEventStore} for unit tests (and only tests). Mirrors
 * the Upstash adapter's semantics — append bounds to `maxEvents` (keep most
 * recent, like `LTRIM -max -1`) and refreshes a lazily-expiring TTL — without a
 * network. Instantiate one per test for isolation. Not exported from any
 * production wiring path.
 */
export class InMemoryTasteEventStore implements TasteEventStore {
  private readonly lists = new Map<string, TasteEvent[]>()
  private readonly expiries = new Map<string, number>()

  /**
   * Optional clock override for deterministic TTL tests (defaults to
   * `Date.now`). Like Redis, expiry is lazy — checked on the next op.
   */
  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly maxEvents: number = MAX_TASTE_EVENTS,
    private readonly ttlSeconds: number = TASTE_STORE_TTL_SECONDS,
  ) {}

  async read(sid: string): Promise<TasteEvent[]> {
    this.maybeExpire(sid)
    return [...(this.lists.get(sid) ?? [])]
  }

  async append(sid: string, event: TasteEvent): Promise<void> {
    this.maybeExpire(sid)
    const next = [...(this.lists.get(sid) ?? []), event].slice(-this.maxEvents)
    this.lists.set(sid, next)
    this.expiries.set(sid, this.now() + this.ttlSeconds * 1000)
  }

  async clear(sid: string): Promise<void> {
    this.lists.delete(sid)
    this.expiries.delete(sid)
  }

  private maybeExpire(sid: string): void {
    const expiry = this.expiries.get(sid)
    if (expiry === undefined) return
    if (this.now() < expiry) return
    this.lists.delete(sid)
    this.expiries.delete(sid)
  }
}
