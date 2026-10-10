import { describe, expect, it } from 'vitest'
import { pickDistinctShapes } from './distinct-shapes'

const sake = (brandId: number, f: [number, number, number, number, number, number], nameRomaji: string | null = `Sake ${brandId}`) => ({
  brandId,
  nameRomaji,
  f1: f[0],
  f2: f[1],
  f3: f[2],
  f4: f[3],
  f5: f[4],
  f6: f[5],
})

// A small catalogue: a crowd of middling sakes and one clear example of each
// shape — an aromatic one, a rich one, a dry one.
const MIDDLING = [1, 2, 3, 4, 5, 6].map((id) => sake(id, [0.4, 0.4, 0.35, 0.5, 0.4, 0.5]))
const AROMATIC = sake(10, [0.9, 0.45, 0.25, 0.3, 0.3, 0.6])
const RICH = sake(20, [0.3, 0.7, 0.85, 0.45, 0.45, 0.25])
const DRY = sake(30, [0.2, 0.3, 0.35, 0.6, 0.9, 0.7])
const POOL = [...MIDDLING, AROMATIC, RICH, DRY]

describe('pickDistinctShapes', () => {
  it('finds one clear example each of an aromatic, a rich and a dry sake', () => {
    const picks = pickDistinctShapes(POOL)
    expect(picks.map((pick) => pick.candidate.brandId)).toEqual([10, 20, 30])
  })

  it('tags each pick with the two axes it stands out on, not the ones every sake is high on', () => {
    const [aromatic, rich, dry] = pickDistinctShapes(POOL)
    expect(aromatic.lean.top).toBe('f1')
    expect(rich.lean.top).toBe('f3')
    expect(dry.lean.top).toBe('f5')
    // Three different shapes, so three different leading axes.
    expect(new Set([aromatic.lean.top, rich.lean.top, dry.lean.top]).size).toBe(3)
  })

  it('never offers the same sake twice', () => {
    // One sake that is both the most aromatic and the driest.
    const both = sake(40, [0.95, 0.3, 0.2, 0.3, 0.95, 0.6])
    const picks = pickDistinctShapes([...MIDDLING, both, RICH])
    const ids = picks.map((pick) => pick.candidate.brandId)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('prefers a sake with a Latin name, which an English reader can say', () => {
    const unnamedAromatic = sake(11, [0.95, 0.45, 0.25, 0.3, 0.3, 0.6], null)
    const [aromatic] = pickDistinctShapes([...POOL, unnamedAromatic])
    expect(aromatic.candidate.brandId).toBe(10)
  })

  it('offers nothing when the catalogue is too small to show three shapes', () => {
    expect(pickDistinctShapes([AROMATIC, RICH])).toEqual([])
    expect(pickDistinctShapes([])).toEqual([])
  })
})
