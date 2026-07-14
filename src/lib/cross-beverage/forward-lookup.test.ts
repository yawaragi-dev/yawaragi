import { describe, expect, it } from 'vitest'
import {
  CROSS_BEVERAGE_DESCRIPTOR_ALIASES,
  CROSS_BEVERAGE_MAP,
} from '@/lib/ai/tools/cross-beverage-data'
import {
  knownCrossBeverageDescriptors,
  resolveCrossBeverageDescriptor,
  resolveCrossBeverageTarget,
} from '@/lib/cross-beverage/forward-lookup'

// Drive the tests off the real data reflectively so they don't hardcode
// specific descriptors that a data re-tune could remove.
const sample = CROSS_BEVERAGE_MAP[0]!

describe('resolveCrossBeverageTarget', () => {
  it('returns the row for a known descriptor + beverage', () => {
    const row = resolveCrossBeverageTarget(sample.descriptor, sample.beverage)
    expect(row).not.toBeNull()
    expect(row?.descriptor).toBe(sample.descriptor)
    expect(row?.beverage).toBe(sample.beverage)
  })

  it('returns null for an unmapped descriptor', () => {
    expect(resolveCrossBeverageTarget('__definitely-not-a-descriptor__', sample.beverage)).toBeNull()
  })

  it('normalises whitespace and case before lookup', () => {
    const row = resolveCrossBeverageTarget(`  ${sample.descriptor.toUpperCase()} `, sample.beverage)
    expect(row?.descriptor).toBe(sample.descriptor)
  })
})

describe('resolveCrossBeverageDescriptor', () => {
  it('leaves a canonical descriptor unchanged (bar normalisation)', () => {
    expect(resolveCrossBeverageDescriptor(sample.descriptor)).toBe(sample.descriptor)
  })

  it('redirects an alias to its canonical descriptor', () => {
    const aliasEntries = Object.entries(CROSS_BEVERAGE_DESCRIPTOR_ALIASES)
    // The data ships aliases; if that ever changes this guards against a silent
    // no-op test.
    expect(aliasEntries.length).toBeGreaterThan(0)
    const [alias, canonical] = aliasEntries[0]!
    expect(resolveCrossBeverageDescriptor(alias)).toBe(canonical)
  })
})

describe('knownCrossBeverageDescriptors', () => {
  it('lists the descriptors for a beverage category, including the sample', () => {
    const known = knownCrossBeverageDescriptors(sample.beverage)
    expect(known).toContain(sample.descriptor)
    expect(known.every((d) => typeof d === 'string')).toBe(true)
  })
})
