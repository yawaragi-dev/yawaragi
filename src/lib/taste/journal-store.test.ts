import { describe, expect, it, vi } from 'vitest'
import { InMemoryJournalStore } from '@/lib/collection/in-memory-record-store'
import { UpstashJournalStore } from '@/lib/collection/upstash-record-store'
import type { JournalEntry } from '@/lib/schemas/journal-entry'
import { journalKey, parseStoredEntries } from '@/lib/taste/journal-store'

// What every collection store does — upsert, remove, clear, per-user scope,
// read order, unreadable records — is the contract in `record-store.test.ts`.
// This file pins what is the journal's own: its key and the commands it sends.

const TARGET = { f1: 0.2, f2: 0.6, f3: 0.6, f4: 0.4, f5: 0.1, f6: 0.3 }

const entry = (id: string, occurredAt: number, over: Partial<JournalEntry> = {}): JournalEntry => ({
  schemaVersion: 3,
  id,
  event: { kind: 'rating', rating: 5, brandId: occurredAt, target: TARGET, occurredAt },
  sake: { nameKanji: '鍋島', nameRomaji: 'Nabeshima' },
  triedAt: occurredAt,
  createdAt: occurredAt,
  ...over,
})

const USER = 'user_abc'

// A fake `fetch` that records each command array (the JSON body) and returns the
// queued `result` values in order, so tests can assert the exact Redis commands.
function fakeFetch(results: unknown[]) {
  const commands: string[][] = []
  let call = 0
  const impl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    commands.push(JSON.parse(String(init?.body)) as string[])
    const result = results[call++] ?? null
    return { ok: true, json: async () => ({ result }) } as Response
  })
  return { impl: impl as unknown as typeof fetch, commands }
}

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

describe('journal reads across schema versions (ADR-0024)', () => {
  it('reads an entry stored before versioning as a current one', async () => {
    const store = new InMemoryJournalStore()
    const legacy: Record<string, unknown> = { ...entry('old', 10) }
    delete legacy.schemaVersion
    store.putRaw(USER, 'old', JSON.stringify(legacy))

    expect(await store.read(USER)).toEqual([entry('old', 10)])
  })
})

describe('the journal on Upstash', () => {
  it('put issues HSET keyed by user + entry id (upsert), never EXPIRE (permanent)', async () => {
    const { impl, commands } = fakeFetch([1])
    await new UpstashJournalStore('https://kv', 'tok', impl).put('user_x', entry('e1', 7))
    expect(commands).toEqual([['HSET', 'journal:user:user_x', 'e1', JSON.stringify(entry('e1', 7))]])
    expect(commands.some((c) => c[0] === 'EXPIRE')).toBe(false)
  })

  it('read issues HGETALL and parses the value half of the flat field/value array', async () => {
    // HGETALL over REST returns [field0, value0, field1, value1, …].
    const flat = ['e2', JSON.stringify(entry('e2', 20)), 'e1', JSON.stringify(entry('e1', 10))]
    const { impl, commands } = fakeFetch([flat])
    const entries = await new UpstashJournalStore('https://kv', 'tok', impl).read('user_x')
    expect(commands[0]).toEqual(['HGETALL', 'journal:user:user_x'])
    // Re-ordered oldest→newest despite the hash's arbitrary field order.
    expect(entries.map((e) => e.id)).toEqual(['e1', 'e2'])
  })

  it('read tolerates a non-array result and corrupt entries', async () => {
    const { impl: nonArray } = fakeFetch([null])
    expect(await new UpstashJournalStore('https://kv', 'tok', nonArray).read('u')).toEqual([])

    const { impl: corrupt } = fakeFetch([['e', '{bad', 'e3', JSON.stringify(entry('e3', 3))]])
    const entries = await new UpstashJournalStore('https://kv', 'tok', corrupt).read('u')
    expect(entries.map((e) => e.id)).toEqual(['e3'])
  })

  it('remove issues HDEL for one entry', async () => {
    const { impl, commands } = fakeFetch([1])
    await new UpstashJournalStore('https://kv', 'tok', impl).remove('user_x', 'e1')
    expect(commands).toEqual([['HDEL', 'journal:user:user_x', 'e1']])
  })

  it('clear issues DEL', async () => {
    const { impl, commands } = fakeFetch([1])
    await new UpstashJournalStore('https://kv', 'tok', impl).clear('user_x')
    expect(commands).toEqual([['DEL', 'journal:user:user_x']])
  })
})
