import { describe, expect, it, vi } from 'vitest'
import type { Pool } from 'pg'
import { escapeLikePattern, searchBrandsFromPool } from '@/lib/sakenowa/search-brands'

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
})
