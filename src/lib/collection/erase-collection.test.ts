import { describe, expect, it } from 'vitest'
import { newCellarRow } from '@/lib/collection/cellar'
import type { BackupStorage } from '@/lib/collection/backup-storage'
import { eraseCollection } from '@/lib/collection/erase-collection'
import { InMemoryBottleHistoryStore } from '@/lib/collection/in-memory-bottle-history-store'
import { InMemoryCellarStore } from '@/lib/collection/in-memory-cellar-store'
import { InMemoryExpressionStore } from '@/lib/collection/in-memory-expression-store'
import type { JournalEntry } from '@/lib/schemas/journal-entry'
import { InMemoryJournalStore } from '@/lib/taste/in-memory-journal-store'

const entry = (id: string): JournalEntry => ({
  schemaVersion: 3,
  id,
  event: { kind: 'rating', rating: 4, brandId: 1, target: null, occurredAt: 1 },
  sake: { nameKanji: '鍋島', nameRomaji: 'Nabeshima' },
  triedAt: 1,
  createdAt: 1,
})

class MemoryStorage implements BackupStorage {
  files = new Map<string, string>()
  async upload(path: string, body: string) {
    this.files.set(path, body)
  }
  async list(prefix: string) {
    return [...this.files.keys()].filter((p) => p.startsWith(`${prefix}/`)).map((p) => p.slice(prefix.length + 1))
  }
  async remove(paths: readonly string[]) {
    for (const p of paths) this.files.delete(p)
  }
  async download(path: string) {
    return this.files.get(path) ?? ''
  }
}

async function collectionOf(...userIds: string[]) {
  const journal = new InMemoryJournalStore()
  const cellar = new InMemoryCellarStore()
  const expressions = new InMemoryExpressionStore()
  const bottleHistory = new InMemoryBottleHistoryStore()
  const backups = new MemoryStorage()
  for (const userId of userIds) {
    await journal.put(userId, entry(`${userId}-e1`))
    journal.putRaw(userId, 'broken', '{nope')
    await cellar.put(userId, newCellarRow({ brandId: 7, nameKanji: '而今', nameRomaji: null }, { sizeMl: 720, nama: false }, 1, 1))
    await expressions.put(userId, { schemaVersion: 1, id: 'x1', own: true, brandId: null, line: null, name: '富久千代', createdAt: 1, updatedAt: 1 })
    await bottleHistory.append(userId, [
      {
        schemaVersion: 1,
        id: `${userId}-ev1`,
        at: 1,
        kind: 'added',
        count: 1,
        thing: { brandId: 7 },
        sake: { nameKanji: '而今', nameRomaji: null },
        sizeMl: 720,
        nama: false,
      },
    ])
    bottleHistory.putRaw(userId, 'broken', '{nope')
    await backups.upload(`${userId}/2026-10-18T03-30-00Z.json`, '{}')
    await backups.upload(`${userId}/2026-10-19T03-30-00Z.json`, '{}')
  }
  return { journal, cellar, expressions, bottleHistory, backups }
}

describe('erasing a collection', () => {
  it('removes the journal, cellar, own bottlings, bottle history and every backup, unreadable records included', async () => {
    const stores = await collectionOf('user_a')

    const erased = await eraseCollection({ userId: 'user_a', ...stores })

    expect(erased).toEqual({ journal: 2, cellar: 1, expressions: 1, bottleHistory: 2, backups: 2 })
    expect((await stores.journal.dump('user_a')).records).toEqual([])
    expect((await stores.journal.dump('user_a')).rejected).toEqual([])
    expect(await stores.cellar.read('user_a')).toEqual([])
    expect(await stores.expressions.read('user_a')).toEqual([])
    expect(await stores.bottleHistory.size('user_a')).toBe(0)
    expect(await stores.backups.list('user_a')).toEqual([])
  })

  it('leaves everyone else’s collection and backups alone', async () => {
    const stores = await collectionOf('user_a', 'user_b')

    await eraseCollection({ userId: 'user_a', ...stores })

    expect((await stores.journal.dump('user_b')).records.map((e) => e.id)).toEqual(['user_b-e1'])
    expect(await stores.cellar.read('user_b')).toHaveLength(1)
    expect(await stores.bottleHistory.read('user_b')).toHaveLength(1)
    expect(await stores.backups.list('user_b')).toHaveLength(2)
  })
})
