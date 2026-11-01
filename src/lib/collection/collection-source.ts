import 'server-only'

import { auth } from '@clerk/nextjs/server'
import { env } from '@/env'
import { currentUserIsMaintainer } from '@/lib/auth/maintainer'
import type { BottleHistoryStore } from '@/lib/collection/bottle-history-store'
import type { CellarStore } from '@/lib/collection/cellar-store'
import type { ExpressionStore } from '@/lib/collection/expression-store'
import {
  UpstashBottleHistoryStore,
  UpstashCellarStore,
  UpstashExpressionStore,
  UpstashJournalStore,
} from '@/lib/collection/upstash-record-store'
import type { JournalStore } from '@/lib/taste/journal-store'

/**
 * The four stores a Collection is kept in (ADR-0024, ADR-0025): one per
 * segment, plus the bottle history kept beside the cellar.
 */
export interface CollectionStores {
  journal: JournalStore
  cellar: CellarStore
  expressions: ExpressionStore
  history: BottleHistoryStore
}

/**
 * The production stores, on Upstash, or `null` when the Upstash env pair is
 * absent. All four share one database and one REST pair, so they are there
 * together or not at all; `null` degrades the collection to `unavailable` in
 * non-production without Upstash.
 *
 * This is the only place a collection store is constructed. A request reaches
 * the stores through {@link openCollection}; the paths that are not one
 * visitor's request — the daily backup, the Account page's GDPR rows, open to
 * every signed-in visitor rather than only maintainers — call this directly.
 */
export function upstashCollectionStores(): CollectionStores | null {
  const url = env.UPSTASH_REDIS_REST_URL
  const token = env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  return {
    journal: new UpstashJournalStore(url, token),
    cellar: new UpstashCellarStore(url, token),
    expressions: new UpstashExpressionStore(url, token),
    history: new UpstashBottleHistoryStore(url, token),
  }
}

/**
 * Where a request's Collection comes from: who may keep one, and the stores it
 * is kept in. {@link openCollection} asks it and decides the gate; the source
 * only answers. Production is {@link upstashCollectionSource}; tests swap in
 * `InMemoryCollectionSource` (`in-memory-collection.ts`) by mocking
 * {@link collectionSource} — the one seam between an action and its stores.
 */
export interface CollectionSource {
  /**
   * The requesting visitor as a collection owner: their Clerk user id; `null`
   * for an allowlisted maintainer Clerk could not name; `false` for anyone who
   * is not an allowlisted maintainer (ADR-0020).
   */
  owner(): Promise<string | null | false>
  /** The stores, or `null` when they are not configured. */
  stores(): CollectionStores | null
}

export const upstashCollectionSource: CollectionSource = {
  async owner() {
    if (!(await currentUserIsMaintainer())) return false
    const { userId } = await auth()
    return userId ?? null
  },
  stores: upstashCollectionStores,
}

/** The source this process reads collections from. */
export function collectionSource(): CollectionSource {
  return upstashCollectionSource
}
