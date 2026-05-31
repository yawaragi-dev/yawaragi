import { describe, expect, it } from 'vitest'
import { classifyIssue, detectPhaseNumber, phaseToMilestone } from './phase-mapping'
import type { IssueRecord } from './types'

function fixture(overrides: Partial<IssueRecord> & { title: string }): IssueRecord {
  return {
    number: 1,
    state: 'OPEN',
    createdAt: '2026-05-01T00:00:00Z',
    closedAt: null,
    ...overrides,
  }
}

describe('detectPhaseNumber', () => {
  it('reads the phase number from a slice title', () => {
    expect(detectPhaseNumber('Phase 2 Slice 7 — <SakenowaAttribution />')).toBe(2)
  })

  it('reads the phase number from a parent title', () => {
    expect(detectPhaseNumber('Phase 0 — Compliance & i18n foundation')).toBe(0)
  })

  it('is case insensitive', () => {
    expect(detectPhaseNumber('phase 3 prerequisite — Anthropic Files API ban')).toBe(3)
  })

  it('returns null when there is no phase reference', () => {
    expect(detectPhaseNumber('chore(security): 14-day npm version quarantine')).toBeNull()
  })
})

describe('phaseToMilestone', () => {
  it('groups Phase 0 (and the absorbed Phase 1) into M1', () => {
    expect(phaseToMilestone(0)).toBe('M1')
    expect(phaseToMilestone(1)).toBe('M1')
  })

  it('maps Phase 2 to M2', () => {
    expect(phaseToMilestone(2)).toBe('M2')
  })

  it('groups the flagship phases 3, 4, 5 into M3', () => {
    expect(phaseToMilestone(3)).toBe('M3')
    expect(phaseToMilestone(4)).toBe('M3')
    expect(phaseToMilestone(5)).toBe('M3')
  })

  it('returns null for Phase 6+ so launch-gating work does not dominate the bar', () => {
    expect(phaseToMilestone(6)).toBeNull()
    expect(phaseToMilestone(7)).toBeNull()
  })
})

describe('classifyIssue', () => {
  it('flags slice issues as non-parent', () => {
    const c = classifyIssue(fixture({ title: 'Phase 2 Slice 7 — <SakenowaAttribution />' }))
    expect(c.milestone).toBe('M2')
    expect(c.isSlice).toBe(true)
    expect(c.isParent).toBe(false)
  })

  it('flags a phase-level umbrella issue as parent', () => {
    const c = classifyIssue(fixture({ title: 'Phase 2 — Data foundation' }))
    expect(c.milestone).toBe('M2')
    expect(c.isSlice).toBe(false)
    expect(c.isParent).toBe(true)
  })

  it('classifies non-phase issues with milestone=null', () => {
    const c = classifyIssue(fixture({ title: 'docs(readme): CI status badge + architecture diagram' }))
    expect(c.milestone).toBeNull()
    expect(c.isParent).toBe(false)
  })
})
