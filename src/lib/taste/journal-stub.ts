import type { FlavorProfile } from '@/lib/schemas/flavor-profile'
import type { JournalEntry } from '@/lib/schemas/journal-entry'
import type { MaintainerJournalState } from '@/lib/taste/resolve-maintainer-journal'

/**
 * The non-production `yawaragi_journal_stub` fixture, in one place.
 *
 * Three surfaces read the journal: §11 Collection lists it, §12's Palate
 * derives from it (CONTEXT.md — the Palate is the journal's output view), and
 * §3 Home shows the three most recent. Each had its own copy of these entries
 * while there was only one reader. Two copies is where a stub starts lying: a
 * spec green against one fixture and a spec green against another can both
 * pass while the surfaces disagree about data they claim to share.
 *
 * The cookie also stands in for the maintainer check (ADR-0020), so an E2E
 * driving these states needs no Clerk session and no Upstash. It is read only
 * when `NODE_ENV !== 'production'`; the callers enforce that, not this module,
 * because the check belongs where the cookie is read.
 */

export const STUB_JOURNAL_PROFILE: FlavorProfile = {
  f1: 0.62,
  f2: 0.55,
  f3: 0.4,
  f4: 0.48,
  f5: 0.3,
  f6: 0.58,
}

/**
 * Three entries, newest first, spread across two months and three ages.
 *
 * Three rather than two because §3 shows up to three and "All {n} →" has to
 * have an `n` worth linking; across two months because §11's date blocks
 * should be exercised over a boundary; at a fixed instant because a relative
 * age ("2d") computed from a moving fixture is a test that changes its own
 * expectations overnight.
 */
export const STUB_JOURNAL_NOW = Date.UTC(2026, 6, 20, 12, 0, 0)

export const STUB_JOURNAL_ENTRIES: readonly JournalEntry[] = [
  {
    id: 's1',
    event: {
      kind: 'rating',
      rating: 5,
      brandId: 1,
      target: STUB_JOURNAL_PROFILE,
      occurredAt: Date.UTC(2026, 6, 18),
    },
    sake: { nameKanji: '而今', nameRomaji: 'Jikon' },
    notes: 'Melon and white peach, gone in a clean line.',
    triedAt: Date.UTC(2026, 6, 18),
    createdAt: Date.UTC(2026, 6, 18),
  },
  {
    id: 's2',
    event: {
      kind: 'rating',
      rating: 4,
      brandId: 2,
      target: STUB_JOURNAL_PROFILE,
      occurredAt: Date.UTC(2026, 6, 6),
    },
    sake: { nameKanji: '鍋島', nameRomaji: 'Nabeshima' },
    triedAt: Date.UTC(2026, 6, 6),
    createdAt: Date.UTC(2026, 6, 6),
  },
  {
    id: 's3',
    event: {
      kind: 'rating',
      rating: 4,
      brandId: 3,
      target: STUB_JOURNAL_PROFILE,
      occurredAt: Date.UTC(2026, 5, 24),
    },
    sake: { nameKanji: '田酒', nameRomaji: 'Denshu' },
    triedAt: Date.UTC(2026, 5, 24),
    createdAt: Date.UTC(2026, 5, 24),
  },
]

/** Map the cookie's value onto a journal state. Unknown values read as empty. */
export function resolveJournalStub(stub: string): MaintainerJournalState {
  if (stub === 'unavailable') return { kind: 'unavailable' }
  if (stub === 'populated') {
    return { kind: 'journal', entries: STUB_JOURNAL_ENTRIES, profile: STUB_JOURNAL_PROFILE }
  }
  return { kind: 'empty' }
}
