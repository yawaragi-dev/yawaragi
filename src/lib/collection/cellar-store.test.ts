import { describe, expect, it, vi } from 'vitest'
import { addBottle } from '@/lib/collection/cellar'
import { cellarKey } from '@/lib/collection/cellar-store'
import { InMemoryCellarStore } from '@/lib/collection/in-memory-cellar-store'
import { UpstashCellarStore } from '@/lib/collection/upstash-cellar-store'
import { CELLAR_BOTTLE_CODEC } from '@/lib/schemas/cellar-bottle'
import { assertCodecComplete } from '@/lib/collection/versioned-record'

const bottle = (brandId: number) =>
  addBottle(undefined, { brandId, nameKanji: '而今', nameRomaji: 'Jikon' }, 1000)

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

describe('cellar storage', () => {
  it('is scoped to the Clerk user id', () => {
    expect(cellarKey('user_abc')).toBe('cellar:user:user_abc')
  })

  it('has an upcaster for every version it has ever had', () => {
    expect(() => assertCodecComplete(CELLAR_BOTTLE_CODEC)).not.toThrow()
  })

  it('keeps one row per sake: a second put for the same brand replaces the first', async () => {
    const store = new InMemoryCellarStore()
    await store.put('u', bottle(7))
    await store.put('u', { ...bottle(7), count: 2 })
    expect((await store.read('u')).map((b) => [b.brandId, b.count])).toEqual([[7, 2]])
  })

  it('removes one sake, and clear erases the cellar', async () => {
    const store = new InMemoryCellarStore()
    await store.put('u', bottle(7))
    await store.put('u', bottle(8))
    await store.remove('u', 7)
    expect((await store.read('u')).map((b) => b.brandId)).toEqual([8])
    await store.clear('u')
    expect(await store.read('u')).toEqual([])
  })

  it('keeps an unreadable row in the dump rather than losing it', async () => {
    const store = new InMemoryCellarStore()
    store.putRaw('u', '9', '{bad')
    expect(await store.read('u')).toEqual([])
    expect((await store.dump('u')).rejected).toEqual([
      { store: 'cellar', id: '9', raw: '{bad', reason: 'json' },
    ])
  })

  it('on Upstash, writes HSET keyed by brand id and never sets an expiry', async () => {
    const { impl, commands } = fakeFetch([1, 1, 1])
    const store = new UpstashCellarStore('https://kv', 'tok', impl)
    await store.put('u', bottle(7))
    await store.remove('u', 7)
    await store.clear('u')
    expect(commands).toEqual([
      ['HSET', 'cellar:user:u', '7', JSON.stringify(bottle(7))],
      ['HDEL', 'cellar:user:u', '7'],
      ['DEL', 'cellar:user:u'],
    ])
  })

  it('on Upstash, reads the flat HGETALL reply', async () => {
    const { impl } = fakeFetch([['7', JSON.stringify(bottle(7))]])
    const rows = await new UpstashCellarStore('https://kv', 'tok', impl).read('u')
    expect(rows).toEqual([bottle(7)])
  })
})
