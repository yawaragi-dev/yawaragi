// Shared types for the progress-dashboard pipeline. Inputs come from
// `gh issue list` / `gh pr list` JSON; outputs are the milestone rollup
// rendered to README + docs/PROGRESS.md.

export type MilestoneId = 'M1' | 'M2' | 'M3'

export interface IssueRecord {
  number: number
  title: string
  state: 'OPEN' | 'CLOSED'
  createdAt: string
  closedAt: string | null
}

export interface PullRequestRecord {
  number: number
  title: string
  mergedAt: string
  createdAt: string
  additions: number
  deletions: number
  changedFiles: number
}

export interface ClassifiedIssue {
  issue: IssueRecord
  milestone: MilestoneId | null
  isSlice: boolean
  isParent: boolean
}

export interface WeightedIssue extends ClassifiedIssue {
  // LoC weight derived from the PR(s) that closed this issue. For open
  // issues we use the median of all measured slice weights as a proxy —
  // a deliberately blunt prior that's better than zero and better than
  // a fabricated T-shirt size.
  weight: number
  weightSource: 'measured' | 'estimated_median'
  linkedPrNumbers: ReadonlyArray<number>
}

export interface MilestoneRollup {
  id: MilestoneId
  label: string
  phaseLabel: string
  description: string
  closedCount: number
  openCount: number
  closedWeight: number
  openWeight: number
  // null when no issues are filed yet under the milestone — surfaced
  // verbatim on the dashboard rather than rendered as 0/0.
  scoped: boolean
}

export interface Velocity {
  // Lines of code per day (LoC = additions + deletions across merged PRs
  // in the trailing window). The number is a velocity proxy, not story
  // points; we name it explicitly to avoid borrowing scrum vocabulary
  // we didn't earn.
  locPerDay: number
  windowDays: number
  prCount: number
  totalLoc: number
}

export interface EtaBand {
  // Calendar dates rendered from remainingWeight / velocity at three
  // scaling factors. The factors encode "things might go faster, slower,
  // or the same as recent history" — a deliberately wide band that's
  // honest about the small sample.
  optimistic: string
  median: string
  pessimistic: string
}

export interface MilestoneEta {
  id: MilestoneId
  remainingWeight: number
  // null when there's nothing left to do (closedWeight only, openWeight=0)
  // or when the milestone isn't scoped yet (Phase 3+ in our case).
  eta: EtaBand | null
  rationale: string
}

export interface DashboardSnapshot {
  generatedAt: string
  milestones: ReadonlyArray<MilestoneRollup>
  etas: ReadonlyArray<MilestoneEta>
  velocity: Velocity
  notMeasured: ReadonlyArray<string>
}
