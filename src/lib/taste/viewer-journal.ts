import 'server-only'

import { auth } from '@clerk/nextjs/server'
import type { cookies } from 'next/headers'
import { currentUserIsMaintainer } from '@/lib/auth/maintainer'
import type { JournalEntry } from '@/lib/schemas/journal-entry'
import { getJournalStore } from '@/lib/taste/get-journal-store'
import { resolveJournalStub } from '@/lib/taste/journal-stub'

type CookieJar = Awaited<ReturnType<typeof cookies>>

/**
 * Can this visitor keep a journal, and what is in it? For the surfaces that
 * WRITE to the journal — the bottle page's "Rate a new tasting", the scan
 * result's log panel — rather than the ones that list it.
 *
 * - `canLog` is ADR-0020's gate: an allowlisted maintainer with a configured
 *   store. Everyone else sees no log affordance at all, because a star that
 *   saves nothing is the dead affordance #162 forbids.
 * - In non-production the `yawaragi_journal_stub` cookie stands in for the
 *   maintainer check, exactly as on Collection and Home, so the E2E can see
 *   the panel without a Clerk session. A stubbed visitor's taps still reach
 *   the real actions, which refuse them — the stub draws the screen, it does
 *   not fake a store.
 */
export async function resolveViewerJournal(
  cookieJar: CookieJar,
): Promise<{ canLog: boolean; entries: readonly JournalEntry[] }> {
  const stub =
    process.env.NODE_ENV !== 'production' ? cookieJar.get('yawaragi_journal_stub')?.value : undefined
  if (stub != null) {
    const state = resolveJournalStub(stub)
    if (state.kind === 'unavailable') return { canLog: false, entries: [] }
    return { canLog: true, entries: state.kind === 'journal' ? state.entries : [] }
  }

  if (!(await currentUserIsMaintainer())) return { canLog: false, entries: [] }
  const { userId } = await auth()
  const store = getJournalStore()
  if (!userId || !store) return { canLog: false, entries: [] }
  return { canLog: true, entries: await store.read(userId) }
}

/** One sake's tastings, newest first. */
export function entriesForBrand(entries: readonly JournalEntry[], brandId: number): JournalEntry[] {
  return entries
    .filter((e) => e.event.kind === 'rating' && e.event.brandId === brandId)
    .sort((a, b) => b.triedAt - a.triedAt)
}
