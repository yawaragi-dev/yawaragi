import 'server-only'

import type { cookies } from 'next/headers'
import { resolveViewer } from '@/lib/collection/viewer'
import type { CellarBottle } from '@/lib/schemas/cellar-bottle'
import type { Expression } from '@/lib/schemas/expression'
import type { JournalEntry } from '@/lib/schemas/journal-entry'

type CookieJar = Awaited<ReturnType<typeof cookies>>

/**
 * Can this visitor keep a journal, and what is in it, in their cellar and among
 * the bottlings they added themselves? For the surfaces that
 * WRITE to the journal — the bottle page's "Rate a new tasting", the scan
 * result's log panel — rather than the ones that list it.
 *
 * - `canLog` is ADR-0020's gate: an allowlisted maintainer with a configured
 *   store. Everyone else sees no log affordance at all, because a star that
 *   saves nothing is the dead affordance #162 forbids.
 * - Who the viewer is — the E2E stub, the maintainer, the sample — is decided
 *   by {@link resolveViewer}, as on every collection screen.
 */
export async function resolveViewerJournal(
  cookieJar: CookieJar,
): Promise<{
  canLog: boolean
  /** There is a collection to show: the visitor's own, or the sample a
   *  visitor without an account asked to look through (read-only). */
  canView: boolean
  entries: readonly JournalEntry[]
  cellar: readonly CellarBottle[]
  expressions: readonly Expression[]
}> {
  const viewer = await resolveViewer(cookieJar)
  if (!viewer.canView) return { canLog: false, canView: false, entries: [], cellar: [], expressions: [] }
  const { journal, cellar, expressions } = await viewer.read('journal', 'cellar', 'expressions')
  return {
    canLog: viewer.canLog,
    canView: true,
    entries: journal.kind === 'journal' ? journal.entries : [],
    cellar,
    expressions,
  }
}

/** One bottling's tastings, newest first. */
export function entriesForExpression(
  entries: readonly JournalEntry[],
  expressionId: string,
): JournalEntry[] {
  return entries
    .filter((e) => e.expression?.id === expressionId)
    .sort((a, b) => b.triedAt - a.triedAt)
}

/** One sake's tastings — its bottlings' included — newest first. */
export function entriesForBrand(entries: readonly JournalEntry[], brandId: number): JournalEntry[] {
  return entries
    .filter((e) => e.event.kind === 'rating' && e.event.brandId === brandId)
    .sort((a, b) => b.triedAt - a.triedAt)
}
