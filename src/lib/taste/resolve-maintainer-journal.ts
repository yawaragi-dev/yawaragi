import 'server-only'

import type { FlavorProfile } from '@/lib/schemas/flavor-profile'
import { type JournalEntry, journalEntriesToTasteEvents } from '@/lib/schemas/journal-entry'
import { deriveTasteProfile } from '@/lib/taste/derive-taste-profile'
import type { JournalStore } from '@/lib/taste/journal-store'

/**
 * The maintainer side of the `/profile` RSC's data source (ADR-0020): read an
 * authenticated maintainer's persistent TastingJournal and derive its TasteMap.
 *
 * The journal-backed twin of {@link readSessionTasteProfile}. Same shape — kept
 * pure over injected `(store, userId, now)` so it's unit-testable without a
 * Clerk session or a live Upstash; the `auth()` call + maintainer-gate stay in
 * the RSC. The crucial difference from the anonymous path: the result carries
 * the `JournalEntry[]` themselves (not bare TasteEvents), because the journal UI
 * needs per-entry identity for edit/delete — the entries ARE the surface, the
 * TasteMap is their derived output view.
 *
 * The derivation is unchanged: a JournalEntry embeds the TasteEvent it emits, so
 * `journalEntriesToTasteEvents` feeds the same `deriveTasteProfile` fold the
 * anonymous stream uses. One derivation path, two sources.
 */
export type MaintainerJournalState =
  /** No store (non-production without Upstash) or no authenticated user id. */
  | { kind: 'unavailable' }
  /** Authenticated maintainer, but the journal has no entries yet. */
  | { kind: 'empty' }
  | { kind: 'journal'; entries: readonly JournalEntry[]; profile: FlavorProfile }

export interface ResolveMaintainerJournalInput {
  store: JournalStore | null
  userId: string | null
  now: number
}

export async function resolveMaintainerJournal({
  store,
  userId,
  now,
}: ResolveMaintainerJournalInput): Promise<MaintainerJournalState> {
  if (store == null || userId == null) {
    return { kind: 'unavailable' }
  }
  const entries = await store.read(userId)
  if (entries.length === 0) {
    return { kind: 'empty' }
  }
  return {
    kind: 'journal',
    entries,
    profile: deriveTasteProfile(journalEntriesToTasteEvents(entries), now),
  }
}
