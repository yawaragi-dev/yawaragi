import { describe, expect, it } from 'vitest'
import { addBottle } from '@/lib/collection/cellar'
import type { BackupStorage } from '@/lib/collection/backup-storage'
import { InMemoryCellarStore } from '@/lib/collection/in-memory-cellar-store'
import { runCollectionBackup } from '@/lib/collection/run-collection-backup'
import { parseCollectionExport } from '@/lib/schemas/journal-export'
import type { JournalEntry } from '@/lib/schemas/journal-entry'
import { InMemoryJournalStore } from '@/lib/taste/in-memory-journal-store'

const TARGET = { f1: 0.2, f2: 0.6, f3: 0.6, f4: 0.4, f5: 0.1, f6: 0.3 }
const entry = (id: string): JournalEntry => ({
  schemaVersion: 2,
  id,
  event: { kind: 'rating', rating: 4, brandId: 1, target: TARGET, occurredAt: 1 },
  sake: { nameKanji: '鍋島', nameRomaji: 'Nabeshima' },
  triedAt: 1,
  createdAt: 1,
})

const NOW = Date.UTC(2026, 9, 5, 3, 30)

/** A bucket in memory: full path → contents. */
class MemoryStorage implements BackupStorage {
  files = new Map<string, string>()
  failUploadsFor: string | null = null
  async upload(path: string, body: string) {
    if (this.failUploadsFor && path.startsWith(`${this.failUploadsFor}/`)) throw new Error('boom')
    this.files.set(path, body)
  }
  async list(prefix: string) {
    return [...this.files.keys()]
      .filter((p) => p.startsWith(`${prefix}/`))
      .map((p) => p.slice(prefix.length + 1))
  }
  async remove(paths: readonly string[]) {
    for (const p of paths) this.files.delete(p)
  }
  async download(path: string) {
    return this.files.get(path) ?? ''
  }
}

async function stores() {
  const journal = new InMemoryJournalStore()
  const cellar = new InMemoryCellarStore()
  await journal.put('user_a', entry('e1'))
  journal.putRaw('user_a', 'broken', '{nope')
  await cellar.put('user_a', addBottle(undefined, { brandId: 7, nameKanji: '而今', nameRomaji: null }, 1))
  return { journal, cellar }
}

describe('the daily backup', () => {
  it('writes one restorable export per user, unreadable records included', async () => {
    const storage = new MemoryStorage()
    const results = await runCollectionBackup({
      userIds: ['user_a'],
      ...(await stores()),
      storage,
      now: NOW,
    })

    expect(results).toEqual([
      {
        userId: 'user_a',
        ok: true,
        path: 'user_a/2026-10-05T03-30-00Z.json',
        journal: 1,
        cellar: 1,
        rejected: 1,
        pruned: 0,
      },
    ])
    const parsed = parseCollectionExport(JSON.parse(storage.files.get('user_a/2026-10-05T03-30-00Z.json')!))
    expect(parsed.ok && parsed.doc.journal.map((e) => e.id)).toEqual(['e1'])
    expect(parsed.ok && parsed.doc.rejected.map((r) => r.raw)).toEqual(['{nope'])
  })

  it('keeps the newest 30 and deletes older ones after a successful write', async () => {
    const storage = new MemoryStorage()
    for (let d = 1; d <= 30; d++) {
      storage.files.set(`user_a/2026-09-${String(d).padStart(2, '0')}T03-30-00Z.json`, '{}')
    }
    const [result] = await runCollectionBackup({ userIds: ['user_a'], ...(await stores()), storage, now: NOW })

    expect(result!.pruned).toBe(1)
    expect(storage.files.has('user_a/2026-09-01T03-30-00Z.json')).toBe(false)
    expect(storage.files.size).toBe(30)
  })

  it("does not let one user's failure stop the others, and prunes nothing for the one that failed", async () => {
    const storage = new MemoryStorage()
    storage.failUploadsFor = 'user_a'
    for (let d = 1; d <= 31; d++) {
      storage.files.set(`user_a/2026-08-${String(d).padStart(2, '0')}T03-30-00Z.json`, '{}')
    }
    const results = await runCollectionBackup({
      userIds: ['user_a', 'user_b'],
      ...(await stores()),
      storage,
      now: NOW,
    })

    expect(results.map((r) => [r.userId, r.ok])).toEqual([
      ['user_a', false],
      ['user_b', true],
    ])
    expect([...storage.files.keys()].filter((k) => k.startsWith('user_a/'))).toHaveLength(31)
  })
})
