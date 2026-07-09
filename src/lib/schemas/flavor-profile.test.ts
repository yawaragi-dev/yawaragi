import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { withProvenance } from './with-provenance'
import {
  FlavorProfileSchema,
  flavorProfileFields,
  parseFlavorProfile,
} from './flavor-profile'

const validTuple = { f1: 0.1, f2: 0.2, f3: 0.3, f4: 0.4, f5: 0.5, f6: 0.6 }

describe('FlavorProfile primitive', () => {
  it('accepts a six-axis tuple with every axis in [0, 1]', () => {
    expect(parseFlavorProfile(validTuple)).toEqual(validTuple)
  })

  it('accepts the boundary values 0 and 1 on every axis', () => {
    const edges = { f1: 0, f2: 1, f3: 0, f4: 1, f5: 0, f6: 1 }
    expect(parseFlavorProfile(edges)).toEqual(edges)
  })

  it('rejects an axis above 1 — the [0, 1] range is a domain invariant', () => {
    expect(() => parseFlavorProfile({ ...validTuple, f1: 1.5 })).toThrow()
  })

  it('rejects a negative axis', () => {
    expect(() => parseFlavorProfile({ ...validTuple, f3: -0.1 })).toThrow()
  })

  it('rejects a tuple missing an axis', () => {
    const missing = { f1: 0.1, f2: 0.2, f3: 0.3, f4: 0.4, f5: 0.5 }
    expect(() => FlavorProfileSchema.parse(missing)).toThrow()
  })

  // The whole point of exporting the raw field shape: a provenance-carrying
  // record composes it and inherits the range invariant at its own parse
  // seam, without re-declaring `z.number().min(0).max(1)` six more times.
  it('carries the range invariant into a record that composes it via .extend', () => {
    const Record = withProvenance(z.literal('sakenowa')).extend(flavorProfileFields)
    expect(Record.parse({ source: 'sakenowa', ...validTuple })).toMatchObject({
      source: 'sakenowa',
      f1: 0.1,
    })
    expect(() => Record.parse({ source: 'sakenowa', ...validTuple, f2: 2 })).toThrow()
  })
})
