// Weight each issue by the LoC of the PR(s) that closed it. LoC is a
// blunt instrument — comments, generated files, and big-but-trivial
// migrations all inflate it — but it has the property that matters most
// for an honest dashboard: it's measurable, reproducible, and impossible
// to game by retroactive T-shirt sizing.
//
// For OPEN slices we substitute the median of measured slice weights as
// a prior. That keeps the bar moving when work lands but resists being
// dominated by a single outlier slice.

import type {
  ClassifiedIssue,
  PullRequestRecord,
  WeightedIssue,
} from './types'

// Captures every "closes #N" / "fixes #N" / "resolves #N" reference in
// a PR title. We deliberately scan titles only (not bodies) because
// titles are what `gh pr list --json title` returns and we want zero
// extra GH API calls per PR.
const CLOSES_REGEX = /\b(?:closes|fixes|resolves)\s+#(\d+)/gi

export function extractClosedIssueNumbers(prTitle: string): ReadonlyArray<number> {
  const out: number[] = []
  let m: RegExpExecArray | null
  // We use exec-in-loop because matchAll requires the /g flag and we
  // already have a /g regex; resetting lastIndex isn't an issue with a
  // fresh literal per call site, but we use a local-loop pattern that
  // works whether the caller reuses the regex or not.
  const re = new RegExp(CLOSES_REGEX.source, CLOSES_REGEX.flags)
  while ((m = re.exec(prTitle)) !== null) {
    out.push(Number.parseInt(m[1], 10))
  }
  return out
}

export function locOfPr(pr: PullRequestRecord): number {
  return pr.additions + pr.deletions
}

function median(values: ReadonlyArray<number>): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid]
}

export function weightIssues(
  classified: ReadonlyArray<ClassifiedIssue>,
  prs: ReadonlyArray<PullRequestRecord>,
): ReadonlyArray<WeightedIssue> {
  // Build issue -> PR(s) index by scanning every PR's title once.
  const issueToPrs = new Map<number, PullRequestRecord[]>()
  for (const pr of prs) {
    for (const issueNum of extractClosedIssueNumbers(pr.title)) {
      const arr = issueToPrs.get(issueNum) ?? []
      arr.push(pr)
      issueToPrs.set(issueNum, arr)
    }
  }

  // Measured weights are computed first so we have a median to use as
  // a prior for the still-open slices.
  const measured: WeightedIssue[] = []
  for (const c of classified) {
    if (c.isParent || !c.isSlice) continue
    const matchingPrs = issueToPrs.get(c.issue.number)
    if (!matchingPrs || matchingPrs.length === 0) continue
    const weight = matchingPrs.reduce((sum, pr) => sum + locOfPr(pr), 0)
    measured.push({
      ...c,
      weight,
      weightSource: 'measured',
      linkedPrNumbers: matchingPrs.map((pr) => pr.number),
    })
  }

  const medianSliceWeight = median(measured.map((w) => w.weight))

  // Second pass: emit weighted records for every classified issue,
  // re-using measured weights where we have them and falling back to
  // the prior elsewhere.
  const measuredByIssue = new Map(measured.map((w) => [w.issue.number, w]))
  return classified.map((c): WeightedIssue => {
    const m = measuredByIssue.get(c.issue.number)
    if (m) return m
    return {
      ...c,
      weight: c.isParent ? 0 : medianSliceWeight,
      weightSource: 'estimated_median',
      linkedPrNumbers: [],
    }
  })
}

export function _testing_median(values: ReadonlyArray<number>): number {
  return median(values)
}
