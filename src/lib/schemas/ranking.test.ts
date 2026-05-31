import { describe, expect, it } from 'vitest'
import { RankingSchema, parseRanking } from './ranking'

const validOverall = {
  source: 'sakenowa',
  kind: 'overall',
  areaId: null,
  rank: 1,
  brandId: 109,
  score: 4.399,
} as const

const validArea = {
  source: 'sakenowa',
  kind: 'area',
  areaId: 20,
  rank: 1,
  brandId: 660,
  score: 4.135,
} as const

describe('Ranking schema', () => {
  it('parses a valid overall ranking row', () => {
    expect(parseRanking(validOverall)).toEqual(validOverall)
  })

  it('parses a valid area-scoped ranking row', () => {
    expect(parseRanking(validArea)).toEqual(validArea)
  })

  it('rejects a ranking without a source', () => {
    expect(() => parseRanking({ kind: 'overall', areaId: null, rank: 1, brandId: 1, score: 1 })).toThrow()
  })

  it('rejects a ranking with an unknown source value', () => {
    expect(() => parseRanking({ ...validOverall, source: 'mystery_provider' })).toThrow()
  })

  it('rejects an unknown kind', () => {
    expect(() => parseRanking({ ...validOverall, kind: 'historical' })).toThrow()
  })

  it("rejects kind='overall' with a non-null areaId", () => {
    expect(() => parseRanking({ ...validOverall, areaId: 0 })).toThrow()
    expect(() => parseRanking({ ...validOverall, areaId: 20 })).toThrow()
  })

  it("rejects kind='area' with a null areaId", () => {
    expect(() => parseRanking({ ...validArea, areaId: null })).toThrow()
  })

  it("accepts kind='area' with areaId 0 (foreign-producer scope)", () => {
    expect(parseRanking({ ...validArea, areaId: 0 })).toMatchObject({ areaId: 0 })
  })

  it('rejects negative areaId', () => {
    expect(() => parseRanking({ ...validArea, areaId: -1 })).toThrow()
  })

  it('rejects a non-positive rank', () => {
    expect(() => parseRanking({ ...validOverall, rank: 0 })).toThrow()
    expect(() => parseRanking({ ...validOverall, rank: -1 })).toThrow()
  })

  it('rejects a non-positive brandId', () => {
    expect(() => parseRanking({ ...validOverall, brandId: 0 })).toThrow()
  })

  it('exposes RankingSchema for composition', () => {
    expect(RankingSchema.parse(validOverall)).toEqual(validOverall)
  })
})
