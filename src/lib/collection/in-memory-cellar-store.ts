import { type CellarStore, decodeCellarHash } from '@/lib/collection/cellar-store'
import type { StoreDump } from '@/lib/collection/versioned-record'
import type { CellarBottle } from '@/lib/schemas/cellar-bottle'

/**
 * In-memory {@link CellarStore} for unit tests (and only tests). Holds JSON
 * strings per brand id, like the Redis hash, so reads go through the same
 * decode as Upstash, and {@link putRaw} can plant a record the code cannot read.
 */
export class InMemoryCellarStore implements CellarStore {
  private readonly hashes = new Map<string, Map<string, string>>()

  async read(userId: string): Promise<CellarBottle[]> {
    return (await this.dump(userId)).records
  }

  async dump(userId: string): Promise<StoreDump<CellarBottle>> {
    return decodeCellarHash([...(this.hashes.get(userId) ?? new Map<string, string>())])
  }

  async put(userId: string, bottle: CellarBottle): Promise<void> {
    this.putRaw(userId, String(bottle.brandId), JSON.stringify(bottle))
  }

  async remove(userId: string, brandId: number): Promise<void> {
    this.hashes.get(userId)?.delete(String(brandId))
  }

  async clear(userId: string): Promise<void> {
    this.hashes.delete(userId)
  }

  /** Test seam: store a value verbatim, bypassing the schema. */
  putRaw(userId: string, field: string, raw: string): void {
    let hash = this.hashes.get(userId)
    if (!hash) {
      hash = new Map<string, string>()
      this.hashes.set(userId, hash)
    }
    hash.set(field, raw)
  }
}
