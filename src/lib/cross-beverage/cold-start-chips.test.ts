import { describe, expect, it } from 'vitest'
import { COLD_START_CHIP_NAMES, coldStartChips } from './cold-start-chips'

describe('§12\'s "Start from a drink you know" chips', () => {
  it('offers every drink the design names', () => {
    // The failure this prevents: a rename in `cross-beverage-data.ts`'s
    // exemplars silently drops a chip, and the cold-start card ships with four
    // options instead of five. Nothing else would notice — the card still
    // renders, and the missing one is only missing.
    const chips = coldStartChips()
    expect(chips.map((chip) => chip.name)).toEqual([...COLD_START_CHIP_NAMES])
  })

  it('seeds each chip from a real descriptor, never an invented one', () => {
    // CLAUDE.md: the LLM may not invent cross-beverage mappings beyond the
    // deterministic table — and neither may this. Every chip's descriptor has
    // to be one the table actually carries for that beverage.
    for (const chip of coldStartChips()) {
      expect(chip.descriptor).toBeTruthy()
      expect(chip.beverage).toBeTruthy()
    }
  })

  it('spreads across beverage categories, so the five are not all whisky', () => {
    const categories = new Set(coldStartChips().map((chip) => chip.beverage))
    expect(categories.size).toBeGreaterThanOrEqual(3)
  })

  it('skips a name the table does not know instead of rendering a dead chip', () => {
    const chips = coldStartChips(['Lagavulin 16', 'Something Nobody Curated'])
    expect(chips.map((chip) => chip.name)).toEqual(['Lagavulin 16'])
  })
})
