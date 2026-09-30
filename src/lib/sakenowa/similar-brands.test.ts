import { describe, expect, it } from 'vitest'
import { flavorDistance } from '@/lib/flavor/flavor-similarity'
import { rankCandidates, type SimilarBrand } from './similar-brands'

// The SQL shortlist is ordered by L1 (cheap, index-friendly) and re-ranked in
// JS by the canonical L2 metric. These tests exist to prove that re-rank is
// load-bearing rather than decorative: if someone deletes it and trusts the
// SQL order, the first case here fails.

function brand(brandId: number, axes: [number, number, number, number, number, number]): SimilarBrand {
  const [f1, f2, f3, f4, f5, f6] = axes
  return {
    brandId,
    nameKanji: `酒${brandId}`,
    nameRomaji: `sake${brandId}`,
    breweryKanji: '蔵',
    breweryRomaji: 'kura',
    chartSource: 'sakenowa',
    f1,
    f2,
    f3,
    f4,
    f5,
    f6,
  }
}

describe('rankCandidates', () => {
  it('orders by L2, not by the L1 order the SQL shortlist arrives in', () => {
    const target = brand(0, [0.5, 0.5, 0.5, 0.5, 0.5, 0.5])

    // `spread` differs by 0.1 on three axes: L1 = 0.30, L2 = 0.173.
    // `spike` differs by 0.25 on one axis:   L1 = 0.25, L2 = 0.250.
    // L1 puts `spike` first; L2 — which is what "similar" means here, because
    // one big divergence is more noticeable than three small ones — puts
    // `spread` first.
    const spread = brand(1, [0.6, 0.6, 0.6, 0.5, 0.5, 0.5])
    const spike = brand(2, [0.75, 0.5, 0.5, 0.5, 0.5, 0.5])

    expect(flavorDistance(target, spread)).toBeLessThan(flavorDistance(target, spike))

    // Handed over in the SQL's L1 order, spike first.
    const ranked = rankCandidates(target, [spike, spread])

    expect(ranked.map((m) => m.brand.brandId)).toEqual([1, 2])
  })

  it('keeps only the requested number of rows, nearest first', () => {
    const target = brand(0, [0.5, 0.5, 0.5, 0.5, 0.5, 0.5])
    const candidates = [
      brand(1, [0.9, 0.9, 0.9, 0.9, 0.9, 0.9]),
      brand(2, [0.55, 0.5, 0.5, 0.5, 0.5, 0.5]),
      brand(3, [0.7, 0.5, 0.5, 0.5, 0.5, 0.5]),
    ]

    const ranked = rankCandidates(target, candidates, 2)

    expect(ranked.map((m) => m.brand.brandId)).toEqual([2, 3])
  })

  it('carries the distance alongside each brand, so a row cannot show another row percentage', () => {
    const target = brand(0, [0.2, 0.2, 0.2, 0.2, 0.2, 0.2])
    const candidate = brand(7, [0.3, 0.2, 0.2, 0.2, 0.2, 0.2])

    const [match] = rankCandidates(target, [candidate])

    expect(match.brand.brandId).toBe(7)
    expect(match.distance).toBeCloseTo(0.1, 10)
  })

  it('drops a candidate whose chart is unusable rather than ranking it wrong', () => {
    // A NaN axis sorts non-deterministically and would poison the ordering.
    // ADR-0016's sparse coverage makes malformed/partial rows a real case.
    const target = brand(0, [0.5, 0.5, 0.5, 0.5, 0.5, 0.5])
    const broken = { ...brand(9, [0.5, 0.5, 0.5, 0.5, 0.5, 0.5]), f3: Number.NaN }
    const good = brand(4, [0.6, 0.5, 0.5, 0.5, 0.5, 0.5])

    const ranked = rankCandidates(target, [broken, good])

    expect(ranked.map((m) => m.brand.brandId)).toEqual([4])
  })
})
