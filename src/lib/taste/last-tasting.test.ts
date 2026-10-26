import { describe, expect, it } from 'vitest'
import { STUB_JOURNAL_ENTRIES } from '@/lib/taste/journal-stub'
import { lastTastingOf } from './last-tasting'

describe('what "Rate a new tasting" says about earlier tastings', () => {
  it('names the newest earlier rating and when it was', () => {
    const newest = STUB_JOURNAL_ENTRIES[0]
    const rating = newest.event.kind === 'rating' ? newest.event.rating : NaN

    expect(lastTastingOf(STUB_JOURNAL_ENTRIES)).toEqual({ kind: 'last', triedAt: newest.triedAt, rating })
  })

  it('says it is the first tasting when there is none', () => {
    expect(lastTastingOf([])).toEqual({ kind: 'first' })
  })
})
