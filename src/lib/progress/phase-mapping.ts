// Map issue titles to one of three user-visible milestones. The project
// uses "Phase N" terminology throughout (titles, ADRs, PRE-GO-LIVE.md);
// "milestone" is the dashboard-facing rollup of those phases.
//
// Mapping rationale (documented on the dashboard too, so a viewer can
// audit it without reading code):
//
//   M1 = Phase 0           — legal + i18n + age-gate foundation
//   M2 = Phase 2           — data foundation (Sakenowa mirror, schemas,
//                            attribution UI, Clerk)
//   M3 = Phase 3 / 4 / 5   — the three flagship surfaces (label scan,
//                            chat recommender, taste profile)
//
// No Phase 1 exists in the build plan today — the structure goes
// Phase 0 → Phase 2 → Phase 3+. The `phase <= 1 → M1` clause is a
// forward-looking guard, not a documented absorption; if a Phase 1
// is ever filed we'd want it grouped with the Phase 0 compliance /
// i18n foundation rather than dropped on the floor.
// Phase 6+ (evals, polish, community, launch) is out of scope for the
// "how close is the product" dashboard — it's gating, not building, and
// would dominate the bar visually for work that's already deferred.

import type { IssueRecord, MilestoneId, ClassifiedIssue } from './types'

const PHASE_TITLE_REGEX = /\bPhase\s+(\d+)\b/i

export function detectPhaseNumber(title: string): number | null {
  const match = title.match(PHASE_TITLE_REGEX)
  return match ? Number.parseInt(match[1], 10) : null
}

export function phaseToMilestone(phase: number): MilestoneId | null {
  if (phase <= 1) return 'M1'
  if (phase === 2) return 'M2'
  if (phase >= 3 && phase <= 5) return 'M3'
  return null
}

const SLICE_REGEX = /\bSlice\s+\d+/i

export function classifyIssue(issue: IssueRecord): ClassifiedIssue {
  const phase = detectPhaseNumber(issue.title)
  const milestone = phase === null ? null : phaseToMilestone(phase)
  const isSlice = SLICE_REGEX.test(issue.title)
  // A "parent" issue is a phase-level umbrella with no slice number —
  // we exclude it from work-remaining counts because all the actual
  // effort lives in its child slices.
  const isParent = phase !== null && !isSlice
  return { issue, milestone, isSlice, isParent }
}

export function classifyAll(issues: ReadonlyArray<IssueRecord>): ReadonlyArray<ClassifiedIssue> {
  return issues.map(classifyIssue)
}
