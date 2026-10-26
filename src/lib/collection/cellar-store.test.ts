import { describe, expect, it, vi } from 'vitest'
import { newCellarRow } from '@/lib/collection/cellar'
import { cellarKey } from '@/lib/collection/cellar-store'
import { InMemoryCellarStore } from '@/lib/collection/in-memory-record-store'
import { UpstashCellarStore } from '@/lib/collection/upstash-record-store'
import { CELLAR_BOTTLE_CODEC } from '@/lib/schemas/cellar-bottle'
import { assertCodecComplete } from '@/lib/collection/versioned-record'

const bottle = (brandId: number) =>
  newCellarRow({ brandId, nameKanji: '而今', nameRomaji: 'Jikon' }, { sizeMl: 720, nama: false }, 1, 1000)

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

  it('reads a row written before bottlings existed, and keeps it under the key it was stored at', async () => {
    const store = new InMemoryCellarStore()
    // A v1 row as it sits in Upstash: no size, no nama, keyed by the brand id.
    const legacy: Record<string, unknown> = { ...bottle(7), schemaVersion: 1 }
    delete legacy.sizeMl
    delete legacy.nama
    store.putRaw('u', '7', JSON.stringify(legacy))

    const [row] = await store.read('u')
    expect(row).toEqual({ ...bottle(7), sizeMl: null, nama: false })
    // Another bottle of the same sake lands on that row, not beside it.
    await store.put('u', { ...row!, count: 2 })
    expect((await store.read('u')).map((b) => b.count)).toEqual([2])
  })

  it('keeps a bottling\'s bottles on a row of their own, beside the sake\'s', async () => {
    const store = new InMemoryCellarStore()
    await store.put('u', bottle(7))
    await store.put('u', { ...bottle(7), expression: { id: 'x1', name: 'Jikon Nama 2025' } })
    expect(await store.read('u')).toHaveLength(2)
    await store.remove('u', 'x:x1|720|s')
    expect((await store.read('u')).map((b) => b.expression)).toEqual([undefined])
  })

  it('on Upstash, writes HSET keyed by the row key and never sets an expiry', async () => {
    const { impl, commands } = fakeFetch([1, 1, 1])
    const store = new UpstashCellarStore('https://kv', 'tok', impl)
    await store.put('u', bottle(7))
    await store.remove('u', '7|720|s')
    await store.clear('u')
    expect(commands).toEqual([
      ['HSET', 'cellar:user:u', '7|720|s', JSON.stringify(bottle(7))],
      ['HDEL', 'cellar:user:u', '7|720|s'],
      ['DEL', 'cellar:user:u'],
    ])
  })

  it('on Upstash, reads the flat HGETALL reply', async () => {
    const { impl } = fakeFetch([['7', JSON.stringify(bottle(7))]])
    const rows = await new UpstashCellarStore('https://kv', 'tok', impl).read('u')
    expect(rows).toEqual([bottle(7)])
  })
})
