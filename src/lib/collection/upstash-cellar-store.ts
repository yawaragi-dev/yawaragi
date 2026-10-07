import 'server-only'

import { type CellarStore, cellarKey, decodeCellarHash } from '@/lib/collection/cellar-store'
import { UpstashHash } from '@/lib/collection/upstash-hash'
import type { StoreDump } from '@/lib/collection/versioned-record'
import type { CellarBottle } from '@/lib/schemas/cellar-bottle'

/**
 * Production {@link CellarStore}: a Redis hash per user on Upstash
 * (`cellar:user:<clerkUserId>`, field = brand id). Same REST plumbing and the
 * same no-`EXPIRE` rule as the journal (ADR-0024).
 */
export class UpstashCellarStore implements CellarStore {
  private readonly hash: UpstashHash

  constructor(restUrl: string, restToken: string, fetchImpl: typeof fetch = fetch) {
    this.hash = new UpstashHash(restUrl, restToken, fetchImpl)
  }

  async read(userId: string): Promise<CellarBottle[]> {
    return (await this.dump(userId)).records
  }

  async dump(userId: string): Promise<StoreDump<CellarBottle>> {
    return decodeCellarHash(await this.hash.getAll(cellarKey(userId)))
  }

  async put(userId: string, bottle: CellarBottle): Promise<void> {
    await this.hash.set(cellarKey(userId), String(bottle.brandId), JSON.stringify(bottle))
  }

  async remove(userId: string, brandId: number): Promise<void> {
    await this.hash.delete(cellarKey(userId), String(brandId))
  }

  async clear(userId: string): Promise<void> {
    await this.hash.drop(cellarKey(userId))
  }
}
