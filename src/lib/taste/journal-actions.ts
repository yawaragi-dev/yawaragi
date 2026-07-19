'use server'

import { auth } from '@clerk/nextjs/server'
import { currentUserIsMaintainer } from '@/lib/auth/maintainer'
import { type JournalEntry, JournalEntrySchema } from '@/lib/schemas/journal-entry'
import { type JournalLogInput, JournalLogInputSchema } from '@/lib/schemas/journal-log-input'
import { lookupFlavorChart } from '@/lib/sakenowa/lookup'
import { getJournalStore } from '@/lib/taste/get-journal-store'
import type { JournalActionState } from '@/lib/taste/journal-action-state'
import type { JournalStore } from '@/lib/taste/journal-store'

/**
 * Phase 5.5 (#244, ADR-0020) — the maintainer's TastingJournal write actions.
 * Create ("Log a sake"), edit-notes, delete-one, and clear, each keyed by the
 * Clerk user id and gated by {@link currentUserIsMaintainer}. v1 is
 * maintainer-only, so non-maintainers get `forbidden` and the UI shows the
 * ephemeral example instead of a persistent journal.
 *
 * Deliberately NOT rate-limited (unlike the anonymous taste actions): the gate
 * already narrows callers to the allowlisted maintainer(s), so there is no
 * paid-API or abuse surface to meter here — the DB lookup and Upstash writes are
 * a single trusted user's own journal.
 *
 * Every successful mutation returns the full, freshly-read journal so the RSC
 * can re-render the list and re-derive the TasteMap in one round-trip.
 */

/** Shared gate: maintainer + a resolved user id + a configured store, or a state. */
async function withMaintainerJournal(
  run: (userId: string, store: JournalStore) => Promise<JournalActionState>,
): Promise<JournalActionState> {
  if (!(await currentUserIsMaintainer())) return { status: 'forbidden' }
  const { userId } = await auth()
  // The gate implies a signed-in user, but resolve defensively rather than `!`.
  if (!userId) return { status: 'forbidden' }
  const store = getJournalStore()
  if (!store) return { status: 'unavailable' }
  return run(userId, store)
}

async function readJournal(store: JournalStore, userId: string): Promise<JournalActionState> {
  return { status: 'ok', entries: await store.read(userId) }
}

/**
 * Log a sake into the journal: look up its FlavorChart, build a rating-kind
 * JournalEntry (server-assigned `id`/`createdAt`; `occurredAt` = `triedAt` so
 * the TasteMap reflects tasting time), and upsert it.
 */
export async function logSakeToJournal(input: JournalLogInput): Promise<JournalActionState> {
  const parsed = JournalLogInputSchema.safeParse(input)
  if (!parsed.success) return { status: 'invalid_input' }
  const { brandId, rating, notes, triedAt } = parsed.data

  return withMaintainerJournal(async (userId, store) => {
    const chart = await lookupFlavorChart(brandId)
    if (chart == null) return { status: 'skipped_no_profile' }

    const now = Date.now()
    const tried = triedAt ?? now
    const trimmedNotes = notes?.trim()
    const entry: JournalEntry = {
      id: crypto.randomUUID(),
      event: {
        kind: 'rating',
        rating,
        brandId,
        target: { f1: chart.f1, f2: chart.f2, f3: chart.f3, f4: chart.f4, f5: chart.f5, f6: chart.f6 },
        occurredAt: tried,
      },
      notes: trimmedNotes ? trimmedNotes : undefined,
      triedAt: tried,
      createdAt: now,
    }

    await store.put(userId, entry)
    return readJournal(store, userId)
  })
}

/** Edit one entry's free-text note (deep mode). Empty note clears it. */
export async function editJournalNotes(
  entryId: string,
  notes: string,
): Promise<JournalActionState> {
  if (typeof entryId !== 'string' || entryId.length === 0) return { status: 'invalid_input' }
  if (typeof notes !== 'string' || notes.length > 2000) return { status: 'invalid_input' }

  return withMaintainerJournal(async (userId, store) => {
    const entries = await store.read(userId)
    const existing = entries.find((e) => e.id === entryId)
    if (!existing) return { status: 'not_found' }

    const trimmed = notes.trim()
    const updated = JournalEntrySchema.parse({
      ...existing,
      notes: trimmed ? trimmed : undefined,
    })
    await store.put(userId, updated)
    return readJournal(store, userId)
  })
}

/** Delete one entry (granular erasure). */
export async function deleteJournalEntry(entryId: string): Promise<JournalActionState> {
  if (typeof entryId !== 'string' || entryId.length === 0) return { status: 'invalid_input' }

  return withMaintainerJournal(async (userId, store) => {
    const entries = await store.read(userId)
    if (!entries.some((e) => e.id === entryId)) return { status: 'not_found' }
    await store.remove(userId, entryId)
    return readJournal(store, userId)
  })
}

/** Erase the entire journal (the GDPR erasure path). */
export async function clearJournal(): Promise<JournalActionState> {
  return withMaintainerJournal(async (userId, store) => {
    await store.clear(userId)
    return readJournal(store, userId)
  })
}
