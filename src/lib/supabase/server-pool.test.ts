import { EventEmitter } from 'node:events'
import { afterEach, describe, expect, it } from 'vitest'
import type { Pool, PoolConfig } from 'pg'
import { SERVER_POOL_MAX, createServerPool } from '@/lib/supabase/server-pool'

/**
 * Supabase's pooler in SESSION mode gives every client connection a slot of
 * its own, for as long as the connection is open, and refuses the sixteenth
 * with `(EMAXCONNSESSION) max clients reached in session mode - max clients
 * are limited to pool_size: 15`. That is the error production logged on the
 * sake page and on its refresh (`/[locale]/sake/[brandId].rsc`) — the refresh
 * every tasting delete triggers — on 2026-10-11 (three times in two minutes)
 * and 2026-10-15.
 *
 * This fake stands in for that pooler: a shared slot count, a hard cap of 15.
 */
const POOLER_SLOTS = 15

class FakePooler {
  open = 0
  refused = 0
  client(): NonNullable<PoolConfig['Client']> {
    return fakeClientOf(this)
  }
}

/** Only what pg-pool calls on a client: connect, query, end, and its events. */
function fakeClientOf(pooler: FakePooler): NonNullable<PoolConfig['Client']> {
  return class FakeClient extends EventEmitter {
    _queryable = true
    _ending = false
    connect(cb: (err?: Error) => void) {
      if (pooler.open >= POOLER_SLOTS) {
        pooler.refused++
        setImmediate(() => cb(new Error('(EMAXCONNSESSION) max clients reached in session mode')))
        return
      }
      pooler.open++
      setImmediate(() => cb())
    }
    query(_text: string, _values: unknown, cb: (err: Error | null, res: unknown) => void) {
      setTimeout(() => cb(null, { rows: [] }), 5)
    }
    end(cb?: () => void) {
      if (!this._ending) {
        this._ending = true
        pooler.open--
        }
        this.emit('end')
        cb?.()
      }
    } as unknown as NonNullable<PoolConfig['Client']>
}

/** The bottle page's render: brand, brewery, chart, the brewery's other sakes
 *  and the catalogue's axis stats, all in one `Promise.all`. */
const PAGE_LOOKUPS = 5

const pools: Pool[] = []
afterEach(async () => {
  await Promise.all(pools.splice(0).map((p) => p.end()))
})

describe('the server pool against the session pooler', () => {
  it('lets four warm server instances each render the bottle page at once without being refused', async () => {
    const pooler = new FakePooler()
    // Vercel spreads a burst of requests — a delete, its refresh, the next
    // delete, its refresh — over several instances, each with its own pool,
    // each keeping its connections open while idle.
    const instances = Array.from({ length: 4 }, () => {
      const pool = createServerPool('postgres://fake', { Client: pooler.client() })
      pools.push(pool)
      return pool
    })

    const renders = instances.map((pool) =>
      Promise.all(Array.from({ length: PAGE_LOOKUPS }, () => pool.query('SELECT 1'))),
    )

    await expect(Promise.all(renders)).resolves.toHaveLength(4)
    expect(pooler.refused).toBe(0)
  })

  it('still runs every lookup of a render, a few at a time', async () => {
    const pooler = new FakePooler()
    const pool = createServerPool('postgres://fake', { Client: pooler.client() })
    pools.push(pool)
    let peak = 0
    const results = await Promise.all(
      Array.from({ length: 12 }, async () => {
        const result = await pool.query('SELECT 1')
        peak = Math.max(peak, pooler.open)
        return result
      }),
    )
    expect(results).toHaveLength(12)
    expect(peak).toBeLessThanOrEqual(SERVER_POOL_MAX)
  })
})
