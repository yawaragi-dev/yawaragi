import { describe, expect, it } from 'vitest'
import type { CellarBottle } from '@/lib/schemas/cellar-bottle'
import type { JournalEntry } from '@/lib/schemas/journal-entry'
import { toOfflineCopy } from './collection-copy'

const tasting = {
  schemaVersion: 3,
  id: 't1',
  event: { kind: 'rating', rating: 4, brandId: 1, target: null, occurredAt: 5 },
  sake: { nameKanji: '獺祭', nameRomaji: 'Dassai' },
  notes: 'Melon, a clean finish.',
  tags: ['chilled'],
  detail: { verdict: 'secret detail' },
  triedAt: 5,
  createdAt: 6,
} as unknown as JournalEntry

const bottle = {
  schemaVersion: 3,
  brandId: null,
  expression: { id: 'x', name: 'Rihaku Wandering Poet' },
  sake: { nameKanji: '李白', nameRomaji: 'Rihaku' },
  sizeMl: 720,
  nama: false,
  count: 2,
  openedAt: 10,
  addedAt: 1,
  updatedAt: 1,
} as unknown as CellarBottle

describe('the copy of the collection kept on the phone', () => {
  it('holds what the offline page shows: names, stars, the note and the date; bottles, sizes and whether one is open', () => {
    expect(toOfflineCopy([tasting], [bottle], 'user_1', 100)).toEqual({
      v: 2,
      owner: 'user_1',
      savedAt: 100,
      journal: [{ id: 't1', name: 'Dassai', kanji: '獺祭', brewery: null, rating: 4, note: 'Melon, a clean finish.', triedAt: 5 }],
      cellar: [{ name: 'Rihaku Wandering Poet', kanji: '李白', count: 2, sizeMl: 720, open: true, nama: false }],
    })
  })

  it('leaves out the detailed notes and quick tags, which the offline page does not show', () => {
    const text = JSON.stringify(toOfflineCopy([tasting], [], null, 1))
    expect(text).not.toContain('secret detail')
    expect(text).not.toContain('chilled')
  })
})
