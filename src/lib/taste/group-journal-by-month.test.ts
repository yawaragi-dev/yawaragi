import { describe, expect, it } from 'vitest'
import type { JournalEntry } from '@/lib/schemas/journal-entry'
import { groupJournalByMonth } from '@/lib/taste/group-journal-by-month'

const TARGET = { f1: 0.5, f2: 0.5, f3: 0.5, f4: 0.5, f5: 0.5, f6: 0.5 }

// 2026-07-18 and 2026-07-02 (July); 2026-06-24 (June). UTC noon to avoid any
// TZ edge near month boundaries.
const JUL_18 = Date.UTC(2026, 6, 18, 12)
const JUL_2 = Date.UTC(2026, 6, 2, 12)
const JUN_24 = Date.UTC(2026, 5, 24, 12)

const entry = (id: string, triedAt: number): JournalEntry => ({
  id,
  event: { kind: 'rating', rating: 4, brandId: 1, target: TARGET, occurredAt: triedAt },
  sake: { nameKanji: '鍋島', nameRomaji: 'Nabeshima' },
  triedAt,
  createdAt: triedAt,
})

describe('groupJournalByMonth', () => {
  it('returns an empty list for no entries', () => {
    expect(groupJournalByMonth([])).toEqual([])
  })

  it('buckets by UTC month, newest month first', () => {
    // Pass oldest→newest (as the store yields); expect July before June.
    const groups = groupJournalByMonth([entry('jun', JUN_24), entry('jul2', JUL_2), entry('jul18', JUL_18)])
    expect(groups.map((g) => g.key)).toEqual(['2026-07', '2026-06'])
  })

  it('orders entries within a month newest-first', () => {
    const groups = groupJournalByMonth([entry('jul2', JUL_2), entry('jul18', JUL_18)])
    expect(groups[0]!.entries.map((e) => e.id)).toEqual(['jul18', 'jul2'])
  })

  it('exposes a firstDay on the first of the month for the heading formatter', () => {
    const [group] = groupJournalByMonth([entry('jul18', JUL_18)])
    expect(group!.firstDay).toBe(Date.UTC(2026, 6, 1))
  })
})
