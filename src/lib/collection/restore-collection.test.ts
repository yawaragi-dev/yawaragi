import { describe, expect, it } from 'vitest'
import { addBottle } from '@/lib/collection/cellar'
import { InMemoryCellarStore } from '@/lib/collection/in-memory-cellar-store'
import { InMemoryExpressionStore } from '@/lib/collection/in-memory-expression-store'
import { restoreCollection } from '@/lib/collection/restore-collection'
import type { Expression } from '@/lib/schemas/expression'
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

const doc = buildCollectionExport({
  userId: 'user_a',
  journal: { records: [entry('a', 1), entry('b', 2)], rejected: [] },
  cellar: { records: [bottle], rejected: [{ store: 'cellar', id: '9', raw: '{x', reason: 'json' }] },
  expressions: { records: [bottling], rejected: [] },
  exportedAt: 0,
})

describe('restoring a backup', () => {
  it('puts back every journal entry, cellar row and own bottling the file holds', async () => {
    const journal = new InMemoryJournalStore()
    const cellar = new InMemoryCellarStore()
    const expressions = new InMemoryExpressionStore()
    const counts = await restoreCollection({ doc, userId: 'user_a', journal, cellar, expressions })

    expect(counts).toEqual({ journal: 2, cellar: 1, expressions: 1, skippedRejected: 1 })
    expect(await expressions.read('user_a')).toEqual([bottling])
    expect((await journal.read('user_a')).map((e) => e.id)).toEqual(['a', 'b'])
    expect(await cellar.read('user_a')).toEqual([bottle])
  })

  it('can be run twice without duplicating anything', async () => {
    const journal = new InMemoryJournalStore()
    const cellar = new InMemoryCellarStore()
    const expressions = new InMemoryExpressionStore()
    await restoreCollection({ doc, userId: 'user_a', journal, cellar, expressions })
    await restoreCollection({ doc, userId: 'user_a', journal, cellar, expressions })
    expect(await journal.read('user_a')).toHaveLength(2)
    expect(await expressions.read('user_a')).toHaveLength(1)
  })

  it('adds back what was lost without deleting what was logged since the backup', async () => {
    const journal = new InMemoryJournalStore()
    const cellar = new InMemoryCellarStore()
    await journal.put('user_a', entry('since', 3))
    await restoreCollection({
      doc,
      userId: 'user_a',
      journal,
      cellar,
      expressions: new InMemoryExpressionStore(),
    })
    expect((await journal.read('user_a')).map((e) => e.id)).toEqual(['a', 'b', 'since'])
  })
})
