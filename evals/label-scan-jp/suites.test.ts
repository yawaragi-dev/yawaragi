import { describe, expect, it } from 'vitest'
import groundTruth from './ground-truth.json'
import { GroundTruthFileSchema } from './schemas'
import { inSuite, isRunSuite } from './suites'

describe('eval suites (#415)', () => {
  it('reads the regular photos by default, all but the held-out ones in full, and those alone on request', () => {
    expect([inSuite('regular', 'regular'), inSuite('regular', undefined), inSuite('regular', 'held_out')]).toEqual([
      true,
      false,
      false,
    ])
    expect([inSuite('full', 'regular'), inSuite('full', undefined), inSuite('full', 'held_out')]).toEqual([
      true,
      true,
      false,
    ])
    expect([inSuite('held_out', 'regular'), inSuite('held_out', undefined), inSuite('held_out', 'held_out')]).toEqual([
      false,
      false,
      true,
    ])
  })

  it('refuses a suite it does not know rather than guessing one', () => {
    expect(isRunSuite('regular')).toBe(true)
    expect(isRunSuite('all')).toBe(false)
  })

  it('keeps the photos of one bottle on one side of the held-out line', () => {
    const entries = Object.values(GroundTruthFileSchema.parse(groundTruth))
    const heldBottles = new Set(entries.filter((e) => e.suite === 'held_out' && e.bottle).map((e) => e.bottle))
    const leaked = entries.filter((e) => e.suite !== 'held_out' && e.bottle && heldBottles.has(e.bottle))
    expect(leaked.map((e) => e.bottle)).toEqual([])
  })
})
