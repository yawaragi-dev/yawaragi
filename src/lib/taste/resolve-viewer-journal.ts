import 'server-only'

import { auth } from '@clerk/nextjs/server'
import type { cookies } from 'next/headers'
import { currentUserIsMaintainer } from '@/lib/auth/maintainer'
import { getExpressionStore } from '@/lib/collection/get-expression-store'
import { readSampleJournal, wantsSampleCollection } from '@/lib/demo/sample-mode'
import type { Expression } from '@/lib/schemas/expression'
import type { FlavorProfile } from '@/lib/schemas/flavor-profile'
import type { JournalEntry } from '@/lib/schemas/journal-entry'
import { getJournalStore } from '@/lib/taste/get-journal-store'
import { resolveJournalStub } from '@/lib/taste/journal-stub'
import { type MaintainerJournalState, resolveMaintainerJournal } from '@/lib/taste/resolve-maintainer-journal'

type CookieJar = Awaited<ReturnType<typeof cookies>>

/** A journal the viewer can see, with what Palate and "in numbers" read from it. */
export interface ViewerJournal {
  entries: readonly JournalEntry[]
  profile: FlavorProfile
  /** The viewer's own bottlings, for grades; empty when they cannot be read. */
  expressions: readonly Expression[]
}

/**
 * The journal on screen for this viewer: the non-production stub (E2E), the
 * maintainer's own (ADR-0020), or the sample collection — in that order — or
 * null when there is none or it is empty.
 */
export async function resolveViewerJournal(cookieJar: CookieJar): Promise<ViewerJournal | null> {
  const journalStub = process.env.NODE_ENV !== 'production' ? cookieJar.get('yawaragi_journal_stub')?.value : undefined
  let expressions: readonly Expression[] = []
  let journal: MaintainerJournalState | null = null
  if (journalStub != null) {
    journal = resolveJournalStub(journalStub)
  } else if (await currentUserIsMaintainer()) {
    const userId = (await auth()).userId
    const expressionStore = getExpressionStore()
    ;[journal, expressions] = await Promise.all([
      resolveMaintainerJournal({ store: getJournalStore(), userId, now: Date.now() }),
      // Only for grades: a failed read leaves the numbers without them.
      userId && expressionStore ? expressionStore.read(userId).catch(() => []) : Promise.resolve([]),
    ])
  } else if (wantsSampleCollection(cookieJar)) {
    const sample = await readSampleJournal(Date.now())
    journal = sample.journal
    expressions = sample.expressions
  }
  if (journal === null || journal.kind !== 'journal') return null
  return { entries: journal.entries, profile: journal.profile, expressions }
}
