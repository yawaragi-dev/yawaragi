import 'server-only'

import type { BottleHistoryStore } from '@/lib/collection/bottle-history-store'
import type { CellarStore } from '@/lib/collection/cellar-store'
import { type CollectionSource, collectionSource } from '@/lib/collection/collection-source'
import type { ExpressionStore } from '@/lib/collection/expression-store'
import type { JournalStore } from '@/lib/taste/journal-store'

/** A Viewer's own Collection, open for reading and writing. */
export interface OwnCollection {
  userId: string
  journal: JournalStore
  cellar: CellarStore
  expressions: ExpressionStore
  /**
   * The bottle history (ADR-0024 "Bottle history"). Typed nullable, unlike the
   * others: it is a record kept beside the cellar, not something an action
   * needs to work, so its absence never makes a collection `unavailable`.
   */
  history: BottleHistoryStore | null
}

/**
 * Why there is no collection to open:
 *
 * - `forbidden`, `maintainer: false` — not an allowlisted maintainer (ADR-0020).
 * - `forbidden`, `maintainer: true` — an allowlisted maintainer whom Clerk
 *   could not name; the gate implies a signed-in user, but it is resolved
 *   defensively rather than with `!`.
 * - `unavailable` — the maintainer is known, the stores are not configured.
 */
export type CollectionClosed =
  | { status: 'forbidden'; maintainer: boolean }
  | { status: 'unavailable'; userId: string }

/**
 * The one place a request reaches the stores of a Collection: the maintainer
 * gate (ADR-0020), a resolved Clerk user id, then the configured stores — in
 * that order, so a visitor who is not a maintainer never touches a store.
 * Returns the collection, or why it is closed; never throws for either.
 *
 * Every collection write goes through it (`withMaintainerCollection`), and so
 * does every collection screen (`resolveViewer`).
 */
export async function openCollection(
  source: CollectionSource = collectionSource(),
): Promise<OwnCollection | CollectionClosed> {
  const owner = await source.owner()
  if (owner === false) return { status: 'forbidden', maintainer: false }
  if (owner === null) return { status: 'forbidden', maintainer: true }
  const stores = source.stores()
  if (!stores) return { status: 'unavailable', userId: owner }
  return { userId: owner, ...stores }
}

export function isCollectionClosed(opened: OwnCollection | CollectionClosed): opened is CollectionClosed {
  return 'status' in opened
}
