/**
 * Runtime tests for the type-branded `publicQuery` helper. The meaningful
 * guarantee is *type-level* (see public-query.test-d.ts); the thin runtime
 * pass-through still has two behaviours worth pinning:
 *   1. delegates to the injected executor with sql/params verbatim, so
 *      existing `*FromPool(...pool)` test patterns keep working;
 *   2. rejects a missing/empty table token at runtime as a belt-and-braces
 *      guard against `publicQuery(undefined as never, ...)` casts.
 */
import { describe, it, expect, vi } from 'vitest'
import { publicQuery } from './public-query'

describe('publicQuery', () => {
  it('delegates to the injected executor with the SQL and params verbatim', async () => {
    const sentinelRow = { brand_id: 1, name: 'Reijin' }
    const query = vi.fn(async () => ({ rows: [sentinelRow], rowCount: 1 }))
    const fakeExecutor = { query } as unknown as Parameters<typeof publicQuery>[3]

    const result = await publicQuery(
      'brands',
      'SELECT brand_id, name FROM brands WHERE brand_id = $1',
      [1],
      fakeExecutor,
    )

    expect(query).toHaveBeenCalledTimes(1)
    expect(query).toHaveBeenCalledWith(
      'SELECT brand_id, name FROM brands WHERE brand_id = $1',
      [1],
    )
    expect(result.rows).toEqual([sentinelRow])
  })

  it('passes undefined params straight through (matches pg.Pool.query signature)', async () => {
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }))
    const fakeExecutor = { query } as unknown as Parameters<typeof publicQuery>[3]

    await publicQuery('rankings', 'SELECT 1', undefined, fakeExecutor)

    expect(query).toHaveBeenCalledWith('SELECT 1', undefined)
  })

  it('throws if the table classification token is not a non-empty string', async () => {
    const fakeExecutor = { query: vi.fn() } as unknown as Parameters<typeof publicQuery>[3]

    await expect(
      // Force the unsafe shape a misusing caller might construct via `as never`.
      publicQuery('' as never, 'SELECT 1', [], fakeExecutor),
    ).rejects.toThrow(/non-empty string/)
  })
})
