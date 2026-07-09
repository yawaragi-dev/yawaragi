import { describe, expect, it } from 'vitest'
import type { FlavorProfile } from '@/lib/schemas/flavor-profile'
import { flavorRadarPolygonPoints } from './flavor-radar-view'

// Geometry: centre (160,160), max radius 110, axes at -90/-30/30/90/150/-150°.
// These assertions pin the axis-position math against known input — the
// point of extracting it from the mock (it was previously only reachable
// through a screenshot of fixed sample data).
describe('flavorRadarPolygonPoints', () => {
  it('plots an all-zero profile at the centre for every axis', () => {
    const zero: FlavorProfile = { f1: 0, f2: 0, f3: 0, f4: 0, f5: 0, f6: 0 }
    expect(flavorRadarPolygonPoints(zero)).toBe(
      '160.00,160.00 160.00,160.00 160.00,160.00 160.00,160.00 160.00,160.00 160.00,160.00',
    )
  })

  it('plots f1 (top axis, -90°) straight up at full magnitude', () => {
    const profile: FlavorProfile = { f1: 1, f2: 0, f3: 0, f4: 0, f5: 0, f6: 0 }
    // f1 at magnitude 1 → (160, 160 - 110) = (160, 50); the rest at centre.
    expect(flavorRadarPolygonPoints(profile).split(' ')[0]).toBe('160.00,50.00')
  })

  it('plots f4 (bottom axis, 90°) straight down at full magnitude', () => {
    const profile: FlavorProfile = { f1: 0, f2: 0, f3: 0, f4: 1, f5: 0, f6: 0 }
    // f4 is the fourth point → (160, 160 + 110) = (160, 270).
    expect(flavorRadarPolygonPoints(profile).split(' ')[3]).toBe('160.00,270.00')
  })

  it('scales the plotted radius linearly with the axis value', () => {
    const half: FlavorProfile = { f1: 0.5, f2: 0, f3: 0, f4: 0, f5: 0, f6: 0 }
    // f1 at 0.5 → (160, 160 - 55) = (160, 105).
    expect(flavorRadarPolygonPoints(half).split(' ')[0]).toBe('160.00,105.00')
  })
})
