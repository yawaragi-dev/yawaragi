import { describe, expect, it } from 'vitest'
import { poolRowToCandidate } from '@/lib/taste/flavor-candidate-pool'

describe('poolRowToCandidate', () => {
  it('maps a DB row to a candidate, Number-converting the string axes', () => {
    const candidate = poolRowToCandidate({
      brand_id: 42,
      name_kanji: '獺祭',
      name_romaji: 'Dassai',
      f1: '0.72',
      f2: '0.35',
      f3: '0.25',
      f4: '0.45',
      f5: '0.55',
      f6: '0.68',
    })
    expect(candidate).toEqual({
      brandId: 42,
      nameJa: '獺祭',
      nameRomaji: 'Dassai',
      f1: 0.72,
      f2: 0.35,
      f3: 0.25,
      f4: 0.45,
      f5: 0.55,
      f6: 0.68,
    })
    // Axes must be numbers, not strings — else findSimilarByFlavor does string
    // arithmetic and every distance is NaN.
    expect(typeof candidate.f1).toBe('number')
  })

  it('preserves a null romaji', () => {
    const candidate = poolRowToCandidate({
      brand_id: 1,
      name_kanji: '獺祭',
      name_romaji: null,
      f1: '0',
      f2: '0',
      f3: '0',
      f4: '0',
      f5: '0',
      f6: '0',
    })
    expect(candidate.nameRomaji).toBeNull()
  })
})
