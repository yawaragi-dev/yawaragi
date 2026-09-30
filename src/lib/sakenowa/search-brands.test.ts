import { describe, expect, it, vi } from 'vitest'
import type { Pool } from 'pg'
import {
  MAX_BRAND_SEARCH_RESULTS,
  MAX_CATALOGUE_SEARCH_RESULTS,
  escapeLikePattern,
  isCatalogueQuerySpecific,
  rankCatalogueMatches,
  searchBrandsFromPool,
  searchCatalogueFromPool,
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

// ─────────────────────────────────────────────────────────────────────────
// §8 Search ("Type it")
// ─────────────────────────────────────────────────────────────────────────
//
// The SQL is integration-tested; these cover the two decisions that are
// product judgement rather than a query: how short a query is too short to be
// worth running, and which of several matches the visitor probably meant.

describe('searchCatalogueFromPool', () => {
  function poolReturning(rows: unknown[]) {
    const query = vi.fn<(sql: string, params: unknown[]) => Promise<{ rows: unknown[] }>>(
      async () => ({ rows }),
    )
    return { query, pool: { query } as unknown as Pool }
  }

  it('does not run a query the page would not show results for', async () => {
    const { query, pool } = poolReturning([])
    expect(await searchCatalogueFromPool('a', pool)).toEqual([])
    expect(query).not.toHaveBeenCalled()
  })

  it('fetches a window wider than it returns, so ranking has something to rank', async () => {
    // The bug this pins: `LIMIT` runs in the database, before any JS can
    // reorder. Fetching exactly 20 rows ordered by name length meant the
    // ranker only ever reordered the twenty shortest-named matches —
    // measured against the live mirror, a search for 山 returned 275 brands,
    // 37 of them beginning with 山, and NONE of those 37 reached the ranker.
    const { query, pool } = poolReturning([])
    await searchCatalogueFromPool('yama', pool)
    const [, params] = query.mock.calls[0]!
    const fetched = (params as unknown[])[3] as number
    expect(fetched).toBeGreaterThan(MAX_CATALOGUE_SEARCH_RESULTS)
  })

  it('asks the database to put exact and prefix matches first, so the window holds them', async () => {
    const { query, pool } = poolReturning([])
    await searchCatalogueFromPool('  Yama ', pool)
    const [, params] = query.mock.calls[0]!
    // Infix pattern, the lowercased needle for the equality tier, and the
    // prefix pattern for the starts-with tier. Trimmed and lowercased,
    // because the column is display-cased.
    expect(params).toEqual(['%Yama%', 'yama', 'yama%', expect.any(Number)])
  })

  it('escapes LIKE metacharacters in every pattern it builds, not just the first', async () => {
    const { query, pool } = poolReturning([])
    await searchCatalogueFromPool('50%', pool)
    const [, params] = query.mock.calls[0]!
    expect(params[0]).toBe('%50\\%%')
    expect(params[2]).toBe('50\\%%')
  })

  it('returns at most the caller\'s limit after ranking the wider window', async () => {
    const rows = Array.from({ length: 60 }, (_, i) => ({
      brand_id: i + 1,
      name_kanji: `酒${i}`,
      name_romaji: `sake${i}`,
      brewery_kanji: null,
      brewery_romaji: null,
    }))
    const { pool } = poolReturning(rows)
    expect(await searchCatalogueFromPool('sake', pool, 5)).toHaveLength(5)
    expect(await searchCatalogueFromPool('sake', pool)).toHaveLength(
      MAX_CATALOGUE_SEARCH_RESULTS,
    )
  })

  it('ranks across the whole window before cutting, not within the visible rows', async () => {
    // The exact match arrives last from the database. If the cut happened
    // before the rank it would be dropped; it must come back first.
    const filler = Array.from({ length: 20 }, (_, i) => ({
      brand_id: i + 1,
      name_kanji: `山田錦${i}`,
      name_romaji: `yamadanishiki${i}`,
      brewery_kanji: null,
      brewery_romaji: null,
    }))
    const exact = {
      brand_id: 999,
      name_kanji: '山',
      name_romaji: 'yama',
      brewery_kanji: null,
      brewery_romaji: null,
    }
    const { pool } = poolReturning([...filler, exact])
    const matches = await searchCatalogueFromPool('yama', pool, 3)
    expect(matches).toHaveLength(3)
    expect(matches[0]!.brandId).toBe(999)
  })
})

describe('isCatalogueQuerySpecific', () => {
  it('runs a single kanji, because one kanji is a word', () => {
    expect(isCatalogueQuerySpecific('山')).toBe(true)
  })

  it('refuses a single Latin letter, which matches most of the romaji column', () => {
    expect(isCatalogueQuerySpecific('a')).toBe(false)
  })

  it('runs two Latin letters', () => {
    expect(isCatalogueQuerySpecific('da')).toBe(true)
  })

  it('treats whitespace as nothing typed', () => {
    expect(isCatalogueQuerySpecific('   ')).toBe(false)
  })
})

describe('rankCatalogueMatches', () => {
  const row = (
    nameKanji: string,
    nameRomaji: string | null,
    breweryKanji: string | null = '旭酒造',
  ) => ({
    brandId: nameKanji.length + (nameRomaji?.length ?? 0),
    nameKanji,
    nameRomaji,
    breweryKanji,
    breweryRomaji: null,
  })

  it('puts the sake you named above the ones that merely contain it', () => {
    const exact = row('男山', 'Otokoyama')
    const contains = row('秘蔵男山', 'Hizo Otokoyama')

    const ranked = rankCatalogueMatches('男山', [contains, exact])

    expect(ranked.map((r) => r.nameKanji)).toEqual(['男山', '秘蔵男山'])
  })

  it('puts a prefix match above a mid-name one', () => {
    const prefix = row('男山特別', 'Otokoyama Tokubetsu')
    const middle = row('秘蔵男山', 'Hizo Otokoyama')

    const ranked = rankCatalogueMatches('男山', [middle, prefix])

    expect(ranked.map((r) => r.nameKanji)).toEqual(['男山特別', '秘蔵男山'])
  })

  it('ranks a brewery-only match last, so searching a maker still finds its sakes', () => {
    // 獺祭 does not contain 旭酒造; it matched because its brewery did.
    const breweryOnly = row('獺祭', 'Dassai', '旭酒造')
    const byName = row('旭酒造の酒', 'Asahi Shuzo no Sake', '旭酒造')

    const ranked = rankCatalogueMatches('旭酒造', [breweryOnly, byName])

    expect(ranked.map((r) => r.nameKanji)).toEqual(['旭酒造の酒', '獺祭'])
  })

  it('matches romaji case-insensitively, since the column is display-cased', () => {
    const exact = row('獺祭', 'Dassai')
    const contains = row('獺祭純米', 'Dassai Junmai')

    const ranked = rankCatalogueMatches('dassai', [contains, exact])

    expect(ranked.map((r) => r.nameRomaji)).toEqual(['Dassai', 'Dassai Junmai'])
  })

  it('keeps the query order within a tier, so one query gives one list', () => {
    const a = row('山田錦', 'Yamada Nishiki')
    const b = row('山廃', 'Yamahai')

    expect(rankCatalogueMatches('山', [a, b]).map((r) => r.nameKanji)).toEqual(['山田錦', '山廃'])
    expect(rankCatalogueMatches('山', [b, a]).map((r) => r.nameKanji)).toEqual(['山廃', '山田錦'])
  })

  it('does not mutate the caller’s array', () => {
    const input = [row('秘蔵男山', 'Hizo Otokoyama'), row('男山', 'Otokoyama')]

    rankCatalogueMatches('男山', input)

    expect(input.map((r) => r.nameKanji)).toEqual(['秘蔵男山', '男山'])
  })
})
