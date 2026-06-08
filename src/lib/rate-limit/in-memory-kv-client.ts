import type { KVClient } from './kv-client'

/**
 * In-memory `KVClient` implementation used by the rate-limit unit tests
 * (and only there). NOT exported from the production wiring path. The
 * map of sorted sets lives in-process so each test instance is fully
 * isolated — instantiate one per test.
 */
export class InMemoryKVClient implements KVClient {
  private readonly sortedSets = new Map<string, Map<string, number>>()
  private readonly expiries = new Map<string, number>()

  /**
   * Optional clock override so tests can drive deterministic TTL
   * behavior. Defaults to `Date.now`. The TTL check only fires on the
   * NEXT op against a key — Redis does the same (it's "lazy
   * expiration"; the active expirer is a background process).
   */
  constructor(private readonly now: () => number = () => Date.now()) {}

  async zAdd(key: string, score: number, member: string): Promise<void> {
    this.maybeExpire(key)
    let set = this.sortedSets.get(key)
    if (!set) {
      set = new Map()
      this.sortedSets.set(key, set)
    }
    set.set(member, score)
  }

  async zRemoveOlderThan(key: string, olderThan: number): Promise<void> {
    this.maybeExpire(key)
    const set = this.sortedSets.get(key)
    if (!set) return
    for (const [member, score] of set) {
      if (score < olderThan) set.delete(member)
    }
  }

  async zCount(key: string, min: number, max: number): Promise<number> {
    this.maybeExpire(key)
    const set = this.sortedSets.get(key)
    if (!set) return 0
    let n = 0
    for (const score of set.values()) {
      if (score >= min && score <= max) n++
    }
    return n
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    this.expiries.set(key, this.now() + ttlSeconds * 1000)
  }

  /**
   * Manually advance the clock for the next op — handy in tests that
   * exercise the TTL path without monkey-patching `Date.now`.
   */
  private maybeExpire(key: string): void {
    const expiry = this.expiries.get(key)
    if (expiry === undefined) return
    if (this.now() < expiry) return
    this.sortedSets.delete(key)
    this.expiries.delete(key)
  }
}
