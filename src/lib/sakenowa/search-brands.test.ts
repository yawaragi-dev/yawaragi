import { describe, expect, it, vi } from 'vitest'
import type { Pool } from 'pg'
import {
  MAX_BRAND_SEARCH_RESULTS,
  escapeLikePattern,
  isCatalogueQuerySpecific,
  rankCatalogueMatches,
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

// ─────────────────────────────────────────────────────────────────────────
// §8 Search ("Type it")
// ─────────────────────────────────────────────────────────────────────────
//
// The SQL is integration-tested; these cover the two decisions that are
// product judgement rather than a query: how short a query is too short to be
// worth running, and which of several matches the visitor probably meant.

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
