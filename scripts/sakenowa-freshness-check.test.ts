import { describe, expect, it } from 'vitest'
import { assessFreshness, type FreshnessInput } from './sakenowa-freshness-check'

const healthy: FreshnessInput = {
  upstreamBrandCount: 3253,
  upstreamMaxBrandId: 121331,
  mirrorSakenowaBrandCount: 3269,
  mirrorSakenowaMaxBrandId: 121331,
  missingCanaryBrands: [],
  missingCanaryBreweries: [],
}

describe('assessFreshness', () => {
  it('passes when the mirror reaches the upstream ID frontier and no canaries are missing', () => {
    const verdict = assessFreshness(healthy)
    expect(verdict).toEqual({ ok: true, reasons: [] })
  })

  it('treats a mirror with MORE brands than upstream as healthy, not stale', () => {
    // Upsert-only mirror + manual-curation layer legitimately exceed upstream.
    const verdict = assessFreshness({ ...healthy, mirrorSakenowaBrandCount: 3300 })
    expect(verdict.ok).toBe(true)
  })

  it('flags a mirror capped near the 2024 freeze frontier as behind', () => {
    const verdict = assessFreshness({ ...healthy, mirrorSakenowaMaxBrandId: 79000 })
    expect(verdict.ok).toBe(false)
    expect(verdict.reasons.join(' ')).toMatch(/lags the upstream frontier/)
  })

  it('flags an empty mirror (null max id) as behind', () => {
    const verdict = assessFreshness({ ...healthy, mirrorSakenowaMaxBrandId: null })
    expect(verdict.ok).toBe(false)
    expect(verdict.reasons.join(' ')).toMatch(/lags the upstream frontier/)
  })

  it('flags the mirror when it is missing more than the allowed fraction of upstream brands', () => {
    const verdict = assessFreshness({
      ...healthy,
      mirrorSakenowaBrandCount: 3100, // ~4.7 % short of 3253
    })
    expect(verdict.ok).toBe(false)
    expect(verdict.reasons.join(' ')).toMatch(/missing .* of upstream Sakenowa brands/)
  })

  it('does not flag a shortfall within the allowed fraction', () => {
    const verdict = assessFreshness({
      ...healthy,
      mirrorSakenowaBrandCount: 3230, // ~0.7 % short — within 1 %
    })
    expect(verdict.ok).toBe(true)
  })

  it('respects a custom maxMissingPct threshold', () => {
    const input = { ...healthy, mirrorSakenowaBrandCount: 3230 } // 0.7 % short
    expect(assessFreshness(input, { maxMissingPct: 0.5 }).ok).toBe(false)
    expect(assessFreshness(input, { maxMissingPct: 1 }).ok).toBe(true)
  })

  it('reports every missing canary by name', () => {
    const verdict = assessFreshness({
      ...healthy,
      missingCanaryBrands: ['獺祭'],
      missingCanaryBreweries: ['旭酒造'],
    })
    expect(verdict.ok).toBe(false)
    expect(verdict.reasons.join(' ')).toContain('獺祭')
    expect(verdict.reasons.join(' ')).toContain('旭酒造')
  })
})
