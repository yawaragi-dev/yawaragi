import { describe, expect, it } from 'vitest'
import { DEMO_BOTTLE, DEMO_PALATE } from './demo-bottle'
import { palateLean } from '@/lib/taste/palate-read'
import { ratingBand } from '@/lib/taste/rating-band'

describe('the landing loop’s demo bottle (design v1.8, K)', () => {
  it('reads as a sample, not a sake from the catalogue', () => {
    // 見本 = "sample"; K3 chose it so the bottle can't be taken for a real one.
    expect(DEMO_BOTTLE.kanji).toBe('見本')
    expect(DEMO_BOTTLE).not.toHaveProperty('brandId')
  })

  it('palate grows into the title the storyboard names, "Rich, umami-forward"', () => {
    // §12's own rule turns these into the title: f3's word, then f2's lean.
    expect(palateLean(DEMO_PALATE)).toEqual({ top: 'f3', second: 'f2' })
  })

  it('tap on the fourth star logs a "Very good"', () => {
    expect(DEMO_BOTTLE.rating).toBe(4)
    expect(ratingBand(DEMO_BOTTLE.rating)).toBe('veryGood')
  })
})
