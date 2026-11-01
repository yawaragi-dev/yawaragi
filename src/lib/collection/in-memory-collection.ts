import type { BottleHistoryStore } from '@/lib/collection/bottle-history-store'
import type { CollectionSource, CollectionStores } from '@/lib/collection/collection-source'
import {
  InMemoryBottleHistoryStore,
  InMemoryCellarStore,
  InMemoryExpressionStore,
  InMemoryJournalStore,
} from '@/lib/collection/in-memory-record-store'

/**
 * In-memory {@link CollectionSource} for unit tests (and only tests): a
 * maintainer with an id and four in-memory stores, each a public field so a
 * test can seed and read it, or swap one for a store that fails. Instantiate
 * one per test. A test reaches it through one seam:
 *
 * ```ts
 * const h = vi.hoisted(() => ({ source: null as unknown as InMemoryCollectionSource }))
 * vi.mock('@/lib/collection/collection-source', () => ({ collectionSource: () => h.source }))
 * ```
 *
 * The gate itself (`openCollection`) stays real, so a test that sets
 * {@link ownerId} to `false` sees the refusal a visitor who is not a
 * maintainer gets.
 */
export class InMemoryCollectionSource implements CollectionSource {
  journal = new InMemoryJournalStore()
  cellar = new InMemoryCellarStore()
  expressions = new InMemoryExpressionStore()
  history: BottleHistoryStore = new InMemoryBottleHistoryStore()
  /** `false` until {@link stores} should answer, as with no Upstash env pair. */
  configured = true

  /** The owner {@link owner} answers: an id, `null` for a maintainer Clerk could not name, `false` for a non-maintainer. */
  constructor(public ownerId: string | null | false = 'user_admin') {}

  async owner(): Promise<string | null | false> {
    return this.ownerId
  }

  stores(): CollectionStores | null {
    if (!this.configured) return null
    return { journal: this.journal, cellar: this.cellar, expressions: this.expressions, history: this.history }
  }
}
