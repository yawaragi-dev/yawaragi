import { describe, expect, it } from 'vitest'
import type { RecordStore, RecordStoreSpec } from '@/lib/collection/record-store'

/**
 * The behaviour every {@link RecordStore} adapter owes the collection, run
 * against each adapter for each record kind (`record-store.test.ts`). Test
 * support only — imported by tests, never by app code.
 */
export interface RecordStoreContractFixture<T> {
  spec: RecordStoreSpec<T>
  /** A fresh, empty store, plus a way to plant a raw value under a row key. */
  make(): { store: RecordStore<T>; putRaw(userId: string, field: string, raw: string): Promise<void> }
  /** A valid record: distinct `n` give distinct row keys, and a larger `n` sorts later. */
  record(n: number): T
  /** The same record (same row key) with something a person could change. */
  edit(record: T): T
}

export function recordStoreContract<T>(name: string, fixture: RecordStoreContractFixture<T>): void {
  const { spec, record, edit } = fixture
  const key = (n: number) => spec.rowKey(record(n))

  describe(`${name} (record store contract)`, () => {
    it('has nothing for someone who never stored anything', async () => {
      const { store } = fixture.make()
      expect(await store.read('u')).toEqual([])
      expect(await store.dump('u')).toEqual({ records: [], rejected: [] })
      expect(await store.size('u')).toBe(0)
    })

    it('reads back exactly the record that was put', async () => {
      const { store } = fixture.make()
      await store.put('u', record(1))
      expect(await store.read('u')).toEqual([record(1)])
    })

    it('edits a record in place when it is put again under the same row key', async () => {
      const { store } = fixture.make()
      await store.put('u', record(1))
      await store.put('u', edit(record(1)))
      expect(await store.read('u')).toEqual([edit(record(1))])
    })

    it('removes one record by its row key and leaves the rest', async () => {
      const { store } = fixture.make()
      await store.put('u', record(1))
      await store.put('u', record(2))
      await store.remove('u', key(1))
      expect(await store.read('u')).toEqual([record(2)])
      await store.remove('u', 'not-there')
      expect(await store.size('u')).toBe(1)
    })

    it('writes and deletes several records at once', async () => {
      const { store } = fixture.make()
      await store.putMany('u', [record(1), record(2), record(3)])
      await store.putMany('u', [])
      expect(await store.size('u')).toBe(3)
      await store.removeMany('u', [key(1), key(3)])
      await store.removeMany('u', [])
      expect(await store.read('u')).toEqual([record(2)])
    })

    it('keeps each person\'s records apart, and erasing one person leaves the others', async () => {
      const { store } = fixture.make()
      await store.put('a', record(1))
      await store.put('b', record(2))
      expect(await store.read('a')).toEqual([record(1)])
      await store.clear('a')
      expect(await store.read('a')).toEqual([])
      expect(await store.size('a')).toBe(0)
      expect(await store.read('b')).toEqual([record(2)])
    })

    it('reads records in the same order whatever order they were written in', async () => {
      const forward = fixture.make().store
      const backward = fixture.make().store
      await forward.putMany('u', [record(1), record(2), record(3)])
      await backward.putMany('u', [record(3), record(2), record(1)])
      if (spec.compare) {
        expect(await forward.read('u')).toEqual([record(1), record(2), record(3)])
        expect(await backward.read('u')).toEqual([record(1), record(2), record(3)])
      } else {
        // No order of its own: the same records, the caller sorts.
        const keys = async (s: RecordStore<T>) => (await s.read('u')).map(spec.rowKey).sort()
        expect(await keys(backward)).toEqual(await keys(forward))
      }
    })

    it('keeps a record it cannot read in the dump, out of the read, and counted', async () => {
      const { store, putRaw } = fixture.make()
      await store.put('u', record(1))
      await putRaw('u', 'broken', '{not json')
      expect(await store.read('u')).toEqual([record(1)])
      expect(await store.size('u')).toBe(2)
      expect((await store.dump('u')).rejected).toEqual([
        { store: spec.codec.kind, id: 'broken', raw: '{not json', reason: 'json' },
      ])
    })

    it('sets aside a record written by a newer version of the app rather than misreading it', async () => {
      const { store, putRaw } = fixture.make()
      const raw = JSON.stringify({ ...record(1), schemaVersion: spec.codec.current + 1 })
      await putRaw('u', key(1), raw)
      expect(await store.read('u')).toEqual([])
      expect((await store.dump('u')).rejected).toEqual([
        { store: spec.codec.kind, id: key(1), raw, reason: 'newer' },
      ])
    })
  })
}

/**
 * A stand-in for Upstash's REST endpoint that keeps hashes in memory and
 * answers the commands `UpstashHash` sends, so the Upstash adapter can run the
 * contract without a network.
 */
export function fakeUpstashRest(): typeof fetch {
  const hashes = new Map<string, Map<string, string>>()
  const reply = (result: unknown) => ({ ok: true, json: async () => ({ result }) }) as Response

  return (async (_url: string | URL | Request, init?: RequestInit) => {
    const [command, key, ...args] = JSON.parse(String(init?.body)) as string[]
    const hash = hashes.get(key!)
    switch (command) {
      case 'HGETALL':
        return reply(hash ? [...hash].flat() : [])
      case 'HSET': {
        const target = hash ?? new Map<string, string>()
        hashes.set(key!, target)
        for (let i = 0; i + 1 < args.length; i += 2) target.set(args[i]!, args[i + 1]!)
        return reply(args.length / 2)
      }
      case 'HDEL':
        return reply(args.filter((field) => hash?.delete(field)).length)
      case 'HLEN':
        return reply(hash?.size ?? 0)
      case 'DEL':
        return reply(hashes.delete(key!) ? 1 : 0)
      default:
        throw new Error(`fake Upstash: unexpected command ${command}`)
    }
  }) as typeof fetch
}
