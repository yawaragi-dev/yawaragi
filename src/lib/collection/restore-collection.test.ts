import { describe, expect, it } from 'vitest'
import { addBottle } from '@/lib/collection/cellar'
import { InMemoryCellarStore } from '@/lib/collection/in-memory-cellar-store'
import { restoreCollection } from '@/lib/collection/restore-collection'
import type { JournalEntry } from '@/lib/schemas/journal-entry'
import { InMemoryJournalStore } from '@/lib/taste/in-memory-journal-store'
import { buildCollectionExport } from '@/lib/taste/journal-export'

const TARGET = { f1: 0.2, f2: 0.6, f3: 0.6, f4: 0.4, f5: 0.1, f6: 0.3 }
const entry = (id: string, at: number): JournalEntry => ({
  schemaVersion: 2,
  id,
  event: { kind: 'rating', rating: 4, brandId: 1, target: TARGET, occurredAt: at },
  sake: { nameKanji: '鍋島', nameRomaji: 'Nabeshima' },
  triedAt: at,
  createdAt: at,
})
const bottle = addBottle(undefined, { brandId: 7, nameKanji: '而今', nameRomaji: null }, 1)

const doc = buildCollectionExport({
  userId: 'user_a',
  journal: { records: [entry('a', 1), entry('b', 2)], rejected: [] },
  cellar: { records: [bottle], rejected: [{ store: 'cellar', id: '9', raw: '{x', reason: 'json' }] },
  exportedAt: 0,
})

describe('restoring a backup', () => {
  it('puts back every journal entry and cellar row the file holds', async () => {
    const journal = new InMemoryJournalStore()
    const cellar = new InMemoryCellarStore()
    const counts = await restoreCollection({ doc, userId: 'user_a', journal, cellar })

    expect(counts).toEqual({ journal: 2, cellar: 1, skippedRejected: 1 })
    expect((await journal.read('user_a')).map((e) => e.id)).toEqual(['a', 'b'])
    expect(await cellar.read('user_a')).toEqual([bottle])
  })

  it('can be run twice without duplicating anything', async () => {
    const journal = new InMemoryJournalStore()
    const cellar = new InMemoryCellarStore()
    await restoreCollection({ doc, userId: 'user_a', journal, cellar })
    await restoreCollection({ doc, userId: 'user_a', journal, cellar })
    expect(await journal.read('user_a')).toHaveLength(2)
  })

  it('adds back what was lost without deleting what was logged since the backup', async () => {
    const journal = new InMemoryJournalStore()
    const cellar = new InMemoryCellarStore()
    await journal.put('user_a', entry('since', 3))
    await restoreCollection({ doc, userId: 'user_a', journal, cellar })
    expect((await journal.read('user_a')).map((e) => e.id)).toEqual(['a', 'b', 'since'])
  })
})
