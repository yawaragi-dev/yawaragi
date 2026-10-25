import { describe, expect, it, vi } from 'vitest'
import { bottleHistoryKey } from '@/lib/collection/bottle-history-store'
import { InMemoryBottleHistoryStore } from '@/lib/collection/in-memory-bottle-history-store'
import { UpstashBottleHistoryStore } from '@/lib/collection/upstash-bottle-history-store'
import { assertCodecComplete, decodeVersionedRecord } from '@/lib/collection/versioned-record'
import {
  BOTTLE_EVENT_CODEC,
  BOTTLE_EVENT_SCHEMA_VERSION,
  type BottleEvent,
} from '@/lib/schemas/bottle-event'

const event = (id: string, at = 1000, over: Partial<BottleEvent> = {}): BottleEvent => ({
  schemaVersion: BOTTLE_EVENT_SCHEMA_VERSION,
  id,
  at,
  kind: 'added',
  count: 1,
  thing: { brandId: 7 },
  sake: { nameKanji: '而今', nameRomaji: 'Jikon' },
  sizeMl: 720,
  nama: false,
  ...over,
})

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

describe('a bottle event', () => {
  it('has an upcaster for every version it has ever had', () => {
    expect(() => assertCodecComplete(BOTTLE_EVENT_CODEC)).not.toThrow()
  })

  it('reads back exactly what was written', () => {
    const e = event('a', 5, { thing: { brandId: null, expression: { id: 'x1', name: '富久千代' } } })
    expect(decodeVersionedRecord(JSON.stringify(e), BOTTLE_EVENT_CODEC)).toEqual({ ok: true, value: e })
  })

  it('never names no sake without naming the bottling', () => {
    const e = event('a', 5, { thing: { brandId: null } })
    expect(decodeVersionedRecord(JSON.stringify(e), BOTTLE_EVENT_CODEC)).toEqual({ ok: false, reason: 'invalid' })
  })

  it('is about at least one bottle', () => {
    expect(decodeVersionedRecord(JSON.stringify(event('a', 5, { count: 0 })), BOTTLE_EVENT_CODEC).ok).toBe(false)
  })
})

describe('bottle history storage', () => {
  it('is scoped to the Clerk user id', () => {
    expect(bottleHistoryKey('user_abc')).toBe('bottle-history:user:user_abc')
  })

  it('lists a person\'s events oldest first, and only theirs', async () => {
    const store = new InMemoryBottleHistoryStore()
    await store.append('u', [event('b', 2000), event('a', 1000)])
    await store.append('other', [event('z', 500)])
    expect((await store.read('u')).map((e) => e.id)).toEqual(['a', 'b'])
    expect(await store.size('u')).toBe(2)
  })

  it('writes an event already there once, not twice', async () => {
    const store = new InMemoryBottleHistoryStore()
    await store.append('u', [event('a')])
    await store.append('u', [event('a')])
    expect(await store.read('u')).toHaveLength(1)
  })

  it('keeps an unreadable record in the dump rather than losing it, and clear erases everything', async () => {
    const store = new InMemoryBottleHistoryStore()
    store.putRaw('u', 'x', '{bad')
    expect(await store.read('u')).toEqual([])
    expect((await store.dump('u')).rejected).toEqual([
      { store: 'bottle-history', id: 'x', raw: '{bad', reason: 'json' },
    ])
    expect(await store.size('u')).toBe(1)
    await store.clear('u')
    expect(await store.size('u')).toBe(0)
  })

  it('on Upstash, appends in one HSET keyed by event id and never sets an expiry', async () => {
    const { impl, commands } = fakeFetch([2, 2, 1])
    const store = new UpstashBottleHistoryStore('https://kv', 'tok', impl)
    await store.append('u', [event('a'), event('b')])
    await store.append('u', [])
    expect(await store.size('u')).toBe(2)
    await store.clear('u')
    expect(commands).toEqual([
      ['HSET', 'bottle-history:user:u', 'a', JSON.stringify(event('a')), 'b', JSON.stringify(event('b'))],
      ['HLEN', 'bottle-history:user:u'],
      ['DEL', 'bottle-history:user:u'],
    ])
  })

  it('on Upstash, reads the hash back through the codec, oldest first', async () => {
    const { impl } = fakeFetch([['b', JSON.stringify(event('b', 2)), 'a', JSON.stringify(event('a', 1))]])
    const store = new UpstashBottleHistoryStore('https://kv', 'tok', impl)
    expect((await store.read('u')).map((e) => e.id)).toEqual(['a', 'b'])
  })
})
