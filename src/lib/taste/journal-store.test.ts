import { describe, expect, it } from 'vitest'
import type { JournalEntry } from '@/lib/schemas/journal-entry'
import { InMemoryJournalStore } from '@/lib/taste/in-memory-journal-store'
import { journalKey, parseStoredEntries } from '@/lib/taste/journal-store'

const TARGET = { f1: 0.2, f2: 0.6, f3: 0.6, f4: 0.4, f5: 0.1, f6: 0.3 }

const entry = (id: string, occurredAt: number, over: Partial<JournalEntry> = {}): JournalEntry => ({
  id,
  event: { kind: 'rating', rating: 5, brandId: occurredAt, target: TARGET, occurredAt },
  triedAt: occurredAt,
  createdAt: occurredAt,
  ...over,
})

const USER = 'user_abc'

describe('journalKey', () => {
  it('is scoped to the Clerk user id, not a session', () => {
    expect(journalKey('user_abc')).toBe('journal:user:user_abc')
  })
})

describe('parseStoredEntries', () => {
  it('drops corrupt / non-conforming entries instead of throwing', () => {
    const good = entry('a', 1)
    const parsed = parseStoredEntries(['{not json', JSON.stringify({ id: 'x' }), JSON.stringify(good)])
    expect(parsed.map((e) => e.id)).toEqual(['a'])
  })

  it('orders entries oldest→newest by the embedded event occurredAt', () => {
    const raw = [entry('c', 30), entry('a', 10), entry('b', 20)].map((e) => JSON.stringify(e))
    expect(parseStoredEntries(raw).map((e) => e.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('InMemoryJournalStore', () => {
  it('reads back an entry that was put', async () => {
    const store = new InMemoryJournalStore()
    await store.put(USER, entry('a', 10))
    expect((await store.read(USER)).map((e) => e.id)).toEqual(['a'])
  })

  it('upserts by id — a second put with the same id edits, does not duplicate', async () => {
    const store = new InMemoryJournalStore()
    await store.put(USER, entry('a', 10))
    await store.put(USER, entry('a', 10, { notes: 'edited' }))
    const entries = await store.read(USER)
    expect(entries).toHaveLength(1)
    expect(entries[0]!.notes).toBe('edited')
  })

  it('returns entries oldest→newest regardless of insertion order', async () => {
    const store = new InMemoryJournalStore()
    await store.put(USER, entry('late', 30))
    await store.put(USER, entry('early', 10))
    expect((await store.read(USER)).map((e) => e.id)).toEqual(['early', 'late'])
  })

  it('removes one entry by id, leaving the rest', async () => {
    const store = new InMemoryJournalStore()
    await store.put(USER, entry('a', 10))
    await store.put(USER, entry('b', 20))
    await store.remove(USER, 'a')
    expect((await store.read(USER)).map((e) => e.id)).toEqual(['b'])
  })

  it('clear erases the whole journal (the GDPR erasure path)', async () => {
    const store = new InMemoryJournalStore()
    await store.put(USER, entry('a', 10))
    await store.clear(USER)
    expect(await store.read(USER)).toEqual([])
  })

  it('scopes entries per user — one user cannot read another journal', async () => {
    const store = new InMemoryJournalStore()
    await store.put('user_a', entry('a', 10))
    expect(await store.read('user_b')).toEqual([])
  })
})
