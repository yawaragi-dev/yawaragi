import { describe, expect, it } from 'vitest'
import {
  _testing_median,
  extractClosedIssueNumbers,
  weightIssues,
} from './weighting'
import { classifyAll } from './phase-mapping'
import type { IssueRecord, PullRequestRecord } from './types'

function issue(n: number, title: string, state: IssueRecord['state'] = 'OPEN'): IssueRecord {
  return {
    number: n,
    title,
    state,
    createdAt: '2026-05-01T00:00:00Z',
    closedAt: state === 'CLOSED' ? '2026-05-15T00:00:00Z' : null,
  }
}

function pr(n: number, title: string, additions: number, deletions: number): PullRequestRecord {
  return {
    number: n,
    title,
    mergedAt: '2026-05-20T00:00:00Z',
    createdAt: '2026-05-19T00:00:00Z',
    additions,
    deletions,
    changedFiles: 1,
  }
}

describe('extractClosedIssueNumbers', () => {
  it('finds a single closes reference', () => {
    expect(extractClosedIssueNumbers('feat: Phase 2 Slice 6 (closes #49)')).toEqual([49])
  })

  it('finds multiple references (closes/fixes/resolves)', () => {
    expect(
      extractClosedIssueNumbers('Phase 0 followups (closes #9, fixes #10, resolves #11)'),
    ).toEqual([9, 10, 11])
  })

  it('returns [] when no reference is present', () => {
    expect(extractClosedIssueNumbers('chore: pin engines.node to 22.x')).toEqual([])
  })

  it('is case insensitive', () => {
    expect(extractClosedIssueNumbers('Closes #1 and FIXES #2')).toEqual([1, 2])
  })
})

describe('_testing_median', () => {
  it('returns the middle for an odd-length input', () => {
    expect(_testing_median([3, 1, 2])).toBe(2)
  })

  it('returns the rounded mean of the two centres for an even-length input', () => {
    expect(_testing_median([1, 2, 3, 4])).toBe(3)
  })

  it('returns 0 for an empty input', () => {
    expect(_testing_median([])).toBe(0)
  })
})

describe('weightIssues', () => {
  it('uses the closing PR LoC as the issue weight', () => {
    const classified = classifyAll([
      issue(49, 'Phase 2 Slice 6 — FlavorChart', 'CLOSED'),
    ])
    const prs = [pr(80, 'feat: Phase 2 Slice 6 (closes #49)', 1000, 100)]
    const [w] = weightIssues(classified, prs)
    expect(w.weight).toBe(1100)
    expect(w.weightSource).toBe('measured')
    expect(w.linkedPrNumbers).toEqual([80])
  })

  it('falls back to the median measured weight for open slices', () => {
    const classified = classifyAll([
      issue(49, 'Phase 2 Slice 6 — FlavorChart', 'CLOSED'),
      issue(52, 'Phase 2 Slice 9 — Reference completeness', 'CLOSED'),
      // open slice with no PR yet — should inherit the median
      issue(51, 'Phase 2 Slice 8 — Provenance policy', 'OPEN'),
    ])
    const prs = [
      pr(80, 'feat: Phase 2 Slice 6 (closes #49)', 1000, 100), // 1100
      pr(81, 'feat: Phase 2 Slice 9 (closes #52)', 2500, 50), // 2550
    ]
    const weighted = weightIssues(classified, prs)
    const open = weighted.find((w) => w.issue.number === 51)
    // Median of [1100, 2550] = (1100+2550)/2 = 1825
    expect(open?.weight).toBe(1825)
    expect(open?.weightSource).toBe('estimated_median')
  })

  it('assigns zero weight to parent (umbrella) issues so they do not double-count', () => {
    const classified = classifyAll([
      issue(21, 'Phase 2 — Data foundation', 'OPEN'),
      issue(49, 'Phase 2 Slice 6 — FlavorChart', 'CLOSED'),
    ])
    const prs = [pr(80, 'feat: Phase 2 Slice 6 (closes #49)', 1000, 100)]
    const weighted = weightIssues(classified, prs)
    const parent = weighted.find((w) => w.issue.number === 21)
    expect(parent?.isParent).toBe(true)
    expect(parent?.weight).toBe(0)
  })

  it('sums weight across multiple PRs that close the same issue', () => {
    const classified = classifyAll([issue(7, 'Phase 0 Slice 1 — i18n', 'CLOSED')])
    const prs = [
      pr(7, 'Phase 0 Slice 1 (closes #7)', 800, 100),
      pr(18, 'Phase 0 followups (closes #7)', 20, 50),
    ]
    const w = weightIssues(classified, prs)[0]
    expect(w.weight).toBe(800 + 100 + 20 + 50)
    expect([...w.linkedPrNumbers].sort((a, b) => a - b)).toEqual([7, 18])
  })
})
