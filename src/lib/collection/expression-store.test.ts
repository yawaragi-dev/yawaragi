import { describe, expect, it, vi } from 'vitest'
import { expressionsKey } from '@/lib/collection/expression-store'
import { UpstashExpressionStore } from '@/lib/collection/upstash-record-store'
import { assertCodecComplete } from '@/lib/collection/versioned-record'
import {
  EXPRESSION_CODEC,
  EXPRESSION_SCHEMA_VERSION,
  type Expression,
} from '@/lib/schemas/expression'

const bottling = (id: string, createdAt = 1000): Expression => ({
  schemaVersion: EXPRESSION_SCHEMA_VERSION,
  id,
  own: true,
  brandId: null,
  line: null,
  name: `富久千代 ${id}`,
  createdAt,
  updatedAt: createdAt,
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

describe('own bottling storage', () => {
  it('is scoped to the Clerk user id', () => {
    expect(expressionsKey('user_abc')).toBe('expressions:user:user_abc')
  })

  it('has an upcaster for every version it has ever had', () => {
    expect(() => assertCodecComplete(EXPRESSION_CODEC)).not.toThrow()
  })

  it('on Upstash, writes HSET keyed by the bottling id and never sets an expiry', async () => {
    const { impl, commands } = fakeFetch([1, 1, 1])
    const store = new UpstashExpressionStore('https://kv', 'tok', impl)
    await store.put('u', bottling('a'))
    await store.remove('u', 'a')
    await store.clear('u')
    expect(commands).toEqual([
      ['HSET', 'expressions:user:u', 'a', JSON.stringify(bottling('a'))],
      ['HDEL', 'expressions:user:u', 'a'],
      ['DEL', 'expressions:user:u'],
    ])
  })

  it('on Upstash, reads the hash back through the codec', async () => {
    const { impl } = fakeFetch([['a', JSON.stringify(bottling('a'))]])
    const store = new UpstashExpressionStore('https://kv', 'tok', impl)
    expect(await store.read('u')).toEqual([bottling('a')])
  })
})
