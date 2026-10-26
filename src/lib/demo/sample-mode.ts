import 'server-only'

import type { cookies } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { buildSampleCollection, type SampleCollection } from '@/lib/demo/sample-collection'
import { SAMPLE_COLLECTION_COOKIE } from '@/lib/demo/sample-flag'
import { journalEntriesToTasteEvents } from '@/lib/schemas/journal-entry'
import { deriveTasteProfile } from '@/lib/taste/derive-taste-profile'
import type { MaintainerJournalState } from '@/lib/taste/resolve-maintainer-journal'

type CookieJar = Awaited<ReturnType<typeof cookies>>


/** Whether the visitor asked for the sample — before the maintainer check. */
export function wantsSampleCollection(cookieJar: CookieJar): boolean {
  return cookieJar.get(SAMPLE_COLLECTION_COOKIE)?.value === '1'
}

/**
 * The sample collection, dated against `now`, with its notes in the visitor's
 * language. `resolveViewer` reads it for a `sample` viewer.
 */
export async function readSampleCollection(now: number): Promise<SampleCollection> {
  const t = await getTranslations('sampleCollection.notes')
  return buildSampleCollection({ now, notes: (key) => t(key) })
}

/**
 * The sample in the shape the journal surfaces read a maintainer's in — Home,
 * Collection, Palate — with the Palate derived as a real one is, so it is
 * exactly the one these tastings would make.
 */
export async function readSampleJournal(
  now: number,
): Promise<SampleCollection & { journal: MaintainerJournalState }> {
  const sample = await readSampleCollection(now)
  return {
    ...sample,
    journal: {
      kind: 'journal',
      entries: sample.entries,
      profile: deriveTasteProfile(journalEntriesToTasteEvents(sample.entries), now),
    },
  }
}
