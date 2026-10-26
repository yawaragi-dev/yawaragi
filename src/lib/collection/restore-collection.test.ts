import { describe, expect, it } from 'vitest'
import { newCellarRow } from '@/lib/collection/cellar'
import { InMemoryBottleHistoryStore, InMemoryCellarStore, InMemoryExpressionStore, InMemoryJournalStore } from '@/lib/collection/in-memory-record-store'
import { restoreCollection } from '@/lib/collection/restore-collection'
import type { BottleEvent } from '@/lib/schemas/bottle-event'
import type { Expression } from '@/lib/schemas/expression'
import type { JournalEntry } from '@/lib/schemas/journal-entry'
import { buildCollectionExport } from '@/lib/taste/journal-export'

const TARGET = { f1: 0.2, f2: 0.6, f3: 0.6, f4: 0.4, f5: 0.1, f6: 0.3 }
const entry = (id: string, at: number): JournalEntry => ({
  schemaVersion: 3,
  id,
  event: { kind: 'rating', rating: 4, brandId: 1, target: TARGET, occurredAt: at },
  sake: { nameKanji: '鍋島', nameRomaji: 'Nabeshima' },
  triedAt: at,
  createdAt: at,
})
const bottle = newCellarRow({ brandId: 7, nameKanji: '而今', nameRomaji: null }, { sizeMl: 720, nama: false }, 1, 1)

const bottling: Expression = {
  schemaVersion: 1,
  id: 'x1',
  own: true,
  brandId: 7,
  line: { nameKanji: '而今', nameRomaji: 'Jikon' },
  name: 'Jikon Nama 2025',
  createdAt: 4,
  updatedAt: 4,
}

const added: BottleEvent = {
  schemaVersion: 1,
  id: 'ev1',
  at: 1,
  kind: 'added',
  count: 1,
  thing: { brandId: 7 },
  sake: { nameKanji: '而今', nameRomaji: null },
  sizeMl: 720,
  nama: false,
}
const finished: BottleEvent = { ...added, id: 'ev2', at: 2, kind: 'finished' }

const doc = buildCollectionExport({
  userId: 'user_a',
  journal: { records: [entry('a', 1), entry('b', 2)], rejected: [] },
  cellar: { records: [bottle], rejected: [{ store: 'cellar', id: '9', raw: '{x', reason: 'json' }] },
  expressions: { records: [bottling], rejected: [] },
  bottleHistory: { records: [added, finished], rejected: [] },
  exportedAt: 0,
})

const emptyStores = () => ({
  journal: new InMemoryJournalStore(),
  cellar: new InMemoryCellarStore(),
  expressions: new InMemoryExpressionStore(),
  bottleHistory: new InMemoryBottleHistoryStore(),
})

describe('restoring a backup', () => {
  it('puts back every journal entry, cellar row, own bottling and bottle event the file holds', async () => {
    const stores = emptyStores()
    const counts = await restoreCollection({ doc, userId: 'user_a', ...stores })

    expect(counts).toEqual({ journal: 2, cellar: 1, expressions: 1, bottleHistory: 2, skippedRejected: 1 })
    expect(await stores.expressions.read('user_a')).toEqual([bottling])
    expect((await stores.journal.read('user_a')).map((e) => e.id)).toEqual(['a', 'b'])
    expect(await stores.cellar.read('user_a')).toEqual([bottle])
    expect(await stores.bottleHistory.read('user_a')).toEqual([added, finished])
  })

  it('can be run twice without duplicating anything', async () => {
    const stores = emptyStores()
    await restoreCollection({ doc, userId: 'user_a', ...stores })
    await restoreCollection({ doc, userId: 'user_a', ...stores })
    expect(await stores.journal.read('user_a')).toHaveLength(2)
    expect(await stores.expressions.read('user_a')).toHaveLength(1)
    expect(await stores.bottleHistory.read('user_a')).toHaveLength(2)
  })

  it('adds back what was lost without deleting what was logged since the backup', async () => {
    const stores = emptyStores()
    await stores.journal.put('user_a', entry('since', 3))
    const later: BottleEvent = { ...added, id: 'ev-since', at: 3 }
    await stores.bottleHistory.append('user_a', [later])
    await restoreCollection({ doc, userId: 'user_a', ...stores })
    expect((await stores.journal.read('user_a')).map((e) => e.id)).toEqual(['a', 'b', 'since'])
    expect((await stores.bottleHistory.read('user_a')).map((e) => e.id)).toEqual(['ev1', 'ev2', 'ev-since'])
  })
})
