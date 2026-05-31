import { describe, expect, it } from 'vitest'
import { MILESTONES, rollupByMilestone } from './rollup'
import { classifyAll } from './phase-mapping'
import { weightIssues } from './weighting'
import type { IssueRecord, PullRequestRecord } from './types'

function issue(n: number, title: string, state: IssueRecord['state']): IssueRecord {
  return {
    number: n,
    title,
    state,
    createdAt: '2026-05-01T00:00:00Z',
    closedAt: state === 'CLOSED' ? '2026-05-15T00:00:00Z' : null,
  }
}

function pr(n: number, title: string, additions: number): PullRequestRecord {
  return {
    number: n,
    title,
    mergedAt: '2026-05-20T00:00:00Z',
    createdAt: '2026-05-19T00:00:00Z',
    additions,
    deletions: 0,
    changedFiles: 1,
  }
}

describe('rollupByMilestone', () => {
  it('always returns one row per milestone in canonical order', () => {
    const result = rollupByMilestone([])
    expect(result.map((r) => r.id)).toEqual(MILESTONES.map((m) => m.id))
  })

  it('flags milestones with zero issues as not scoped (so the dashboard surfaces them honestly)', () => {
    const result = rollupByMilestone([])
    for (const row of result) expect(row.scoped).toBe(false)
  })

  it('counts and weighs closed vs open per milestone, excluding the parent umbrella', () => {
    const classified = classifyAll([
      issue(21, 'Phase 2 — Data foundation', 'OPEN'), // parent — excluded
      issue(49, 'Phase 2 Slice 6 — FlavorChart', 'CLOSED'),
      issue(52, 'Phase 2 Slice 9 — Reference completeness', 'CLOSED'),
      issue(51, 'Phase 2 Slice 8 — Provenance', 'OPEN'),
    ])
    const prs = [
      pr(80, 'feat: Phase 2 Slice 6 (closes #49)', 1000),
      pr(81, 'feat: Phase 2 Slice 9 (closes #52)', 2000),
    ]
    const weighted = weightIssues(classified, prs)
    const m2 = rollupByMilestone(weighted).find((r) => r.id === 'M2')!
    expect(m2.scoped).toBe(true)
    expect(m2.closedCount).toBe(2)
    expect(m2.openCount).toBe(1) // not 2 — the parent issue is excluded
    expect(m2.closedWeight).toBe(3000)
    // open slice inherits the median measured weight (1000, 2000 → 1500)
    expect(m2.openWeight).toBe(1500)
  })
})
