import { describe, expect, it } from 'vitest'
import { etaBandFor, etaForMilestone } from './eta'
import type { MilestoneRollup, Velocity } from './types'

const NOW = new Date('2026-05-31T00:00:00Z')

const VELOCITY: Velocity = {
  locPerDay: 100,
  windowDays: 14,
  prCount: 5,
  totalLoc: 1400,
}

describe('etaBandFor', () => {
  it('returns null when there is no remaining work', () => {
    expect(etaBandFor(0, VELOCITY, NOW)).toBeNull()
    expect(etaBandFor(-1, VELOCITY, NOW)).toBeNull()
  })

  it('returns null when velocity is zero (would be a divide-by-zero in days)', () => {
    expect(etaBandFor(1000, { ...VELOCITY, locPerDay: 0 }, NOW)).toBeNull()
  })

  it('renders an asymmetric optimistic / median / pessimistic band', () => {
    // 1000 LoC / 100 LoC/day = 10 days median; band is /1.5x and /0.5x
    const band = etaBandFor(1000, VELOCITY, NOW)
    expect(band).not.toBeNull()
    expect(band!.median).toBe('2026-06-10') // +10
    expect(band!.optimistic).toBe('2026-06-07') // +7 (10/1.5 = 6.67 → 7)
    expect(band!.pessimistic).toBe('2026-06-20') // +20 (10/0.5)
  })
})

describe('etaForMilestone', () => {
  function rollup(overrides: Partial<MilestoneRollup>): MilestoneRollup {
    return {
      id: 'M2',
      label: 'Data foundation',
      phaseLabel: 'Phase 2',
      description: '',
      closedCount: 5,
      openCount: 5,
      closedWeight: 5000,
      openWeight: 5000,
      scoped: true,
      ...overrides,
    }
  }

  it('reports "not scoped" when the milestone has no issues filed', () => {
    const e = etaForMilestone(rollup({ scoped: false, closedCount: 0, openCount: 0 }), VELOCITY, NOW)
    expect(e.eta).toBeNull()
    expect(e.rationale).toMatch(/not yet scoped/i)
  })

  it('reports "complete" when there is no remaining open weight', () => {
    const e = etaForMilestone(rollup({ openCount: 0, openWeight: 0 }), VELOCITY, NOW)
    expect(e.eta).toBeNull()
    expect(e.rationale).toMatch(/complete/i)
  })

  it('reports "no PRs merged" rationale when velocity is zero but work remains', () => {
    const e = etaForMilestone(rollup({}), { ...VELOCITY, locPerDay: 0, prCount: 0, totalLoc: 0 }, NOW)
    expect(e.eta).toBeNull()
    expect(e.rationale).toMatch(/no prs merged/i)
  })

  it('attaches the PR count + window in the rationale so the band is auditable', () => {
    const e = etaForMilestone(rollup({}), VELOCITY, NOW)
    expect(e.rationale).toContain('5 PR')
    expect(e.rationale).toContain('14 days')
  })
})
