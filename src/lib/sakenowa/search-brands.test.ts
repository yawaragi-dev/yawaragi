import { describe, expect, it, vi } from 'vitest'
import type { Pool } from 'pg'
import {
  escapeLikePattern,
  MAX_BRAND_SEARCH_RESULTS,
  searchBrandsFromPool,
} from '@/lib/sakenowa/search-brands'

/**
 * Pure-function + short-circuit unit tests. The SQL itself is exercised against
 * real Postgres in `search-brands.integration.test.ts`; these pin the transforms
 * that don't need a database.
 */
describe('escapeLikePattern', () => {
  it('escapes LIKE wildcards so user input matches literally', () => {
    expect(escapeLikePattern('50%')).toBe('50\\%')
    expect(escapeLikePattern('a_b')).toBe('a\\_b')
    expect(escapeLikePattern('back\\slash')).toBe('back\\\\slash')
  })

  it('leaves ordinary text (incl. kanji) untouched', () => {
    expect(escapeLikePattern('Nabeshima')).toBe('Nabeshima')
    expect(escapeLikePattern('鍋島')).toBe('鍋島')
  })
})

describe('searchBrandsFromPool', () => {
  it('short-circuits an empty / whitespace-only query without touching the DB', async () => {
    const pool = { query: vi.fn() } as unknown as Pool
    expect(await searchBrandsFromPool('   ', pool)).toEqual([])
    expect(pool.query).not.toHaveBeenCalled()
  })

  it('caps the limit at MAX_BRAND_SEARCH_RESULTS and passes an escaped pattern', async () => {
    const query = vi.fn<(sql: string, params: unknown[]) => Promise<{ rows: never[] }>>(async () => ({
      rows: [],
    }))
    const pool = { query } as unknown as Pool
    await searchBrandsFromPool('50%', pool, 50)
    // publicQuery forwards (sql, [pattern, limit]) to pool.query.
    const [, params] = query.mock.calls[0]!
    expect(params).toEqual(['%50\\%%', MAX_BRAND_SEARCH_RESULTS])
  })
})
