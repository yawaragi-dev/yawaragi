import { describe, expect, it } from 'vitest'
import { quickTagsFor } from '@/lib/taste/quick-tags'

const chart = (f: [number, number, number, number, number, number]) => ({
  f1: f[0],
  f2: f[1],
  f3: f[2],
  f4: f[3],
  f5: f[4],
  f6: f[5],
})

describe('the quick chips under a rating', () => {
  it("offers this bottle's two strongest flavors first, then the serving context", () => {
    // A Dassai-like chart: floral and light, little body.
    expect(quickTagsFor(chart([0.62, 0.3, 0.12, 0.35, 0.28, 0.55]))).toEqual([
      'axis:f1',
      'axis:f6',
      'chilled',
      'warm',
      'withFood',
    ])
  })

  it('breaks a tie in axis order, so the chips do not shuffle between renders', () => {
    expect(quickTagsFor(chart([0.4, 0.4, 0.4, 0.1, 0.1, 0.1])).slice(0, 2)).toEqual([
      'axis:f1',
      'axis:f2',
    ])
  })

  it('offers only the serving context for a sake with no flavor chart', () => {
    expect(quickTagsFor(null)).toEqual(['chilled', 'warm', 'withFood'])
  })
})
