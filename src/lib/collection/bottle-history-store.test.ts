import { describe, expect, it, vi } from 'vitest'
import { bottleHistoryKey } from '@/lib/collection/bottle-history-store'
import { InMemoryBottleHistoryStore } from '@/lib/collection/in-memory-record-store'
import { UpstashBottleHistoryStore } from '@/lib/collection/upstash-record-store'
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

  it('takes one bottle out at the visitor\'s request: a smaller line stored again, a line of one deleted', async () => {
    const store = new InMemoryBottleHistoryStore()
    await store.append('u', [event('a', 1, { count: 2 }), event('b', 2, { kind: 'removed' })])
    await store.rewrite('u', { put: [event('a', 1, { count: 1 })], drop: ['b'] })
    expect(await store.read('u')).toEqual([event('a', 1, { count: 1 })])
  })

  it('on Upstash, rewrites with one HSET then one HDEL, smaller lines first', async () => {
    const { impl, commands } = fakeFetch([])
    const store = new UpstashBottleHistoryStore('https://kv', 'tok', impl)
    await store.rewrite('u', { put: [event('a')], drop: ['b', 'c'] })
    await store.rewrite('u', { put: [], drop: [] })
    expect(commands).toEqual([
      ['HSET', 'bottle-history:user:u', 'a', JSON.stringify(event('a'))],
      ['HDEL', 'bottle-history:user:u', 'b', 'c'],
    ])
  })

  it('on Upstash, reads the hash back through the codec, oldest first', async () => {
    const { impl } = fakeFetch([['b', JSON.stringify(event('b', 2)), 'a', JSON.stringify(event('a', 1))]])
    const store = new UpstashBottleHistoryStore('https://kv', 'tok', impl)
    expect((await store.read('u')).map((e) => e.id)).toEqual(['a', 'b'])
  })
})
