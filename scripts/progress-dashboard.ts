// `pnpm progress` — refresh the milestone-progress dashboard.
//
// Wiring:
//   1. Shell out to `gh issue list` + `gh pr list` (JSON).
//   2. Classify issues → milestones (M1/M2/M3) by Phase number in the
//      title.
//   3. Weight each issue by the LoC of its closing PR(s).
//   4. Compute trailing-14-day velocity and per-milestone ETA bands.
//   5. Render a compact block into README.md and a detailed doc into
//      docs/PROGRESS.md.
//
// The script writes committed files on purpose: zero infra, recruiter-
// facing, and reviewable in the diff. CI re-running the script is a
// follow-on, not a blocker.

import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import type {
  DashboardSnapshot,
  IssueRecord,
  PullRequestRecord,
} from '../src/lib/progress/types'
import { classifyAll } from '../src/lib/progress/phase-mapping'
import { weightIssues } from '../src/lib/progress/weighting'
import { rollupByMilestone } from '../src/lib/progress/rollup'
import { computeVelocity, DEFAULT_WINDOW_DAYS } from '../src/lib/progress/velocity'
import { etaForMilestone } from '../src/lib/progress/eta'
import {
  renderDetailDoc,
  renderReadmeBlock,
  spliceReadmeBlock,
} from '../src/lib/progress/render'

// Surfaces the gh CLI is the simplest auth surface (the developer is
// already logged in for issue triage) and matches the project's
// existing scripts which shell out to system tools rather than calling
// network APIs directly. We intentionally take only the four fields we
// need so a schema bump on the gh side fails loudly rather than
// silently widening our inputs.
const ISSUE_FIELDS = 'number,title,state,createdAt,closedAt'
const PR_FIELDS = 'number,title,mergedAt,createdAt,additions,deletions,changedFiles'

interface RawIssue {
  number: number
  title: string
  state: string
  createdAt: string
  closedAt: string | null
}

interface RawPr {
  number: number
  title: string
  mergedAt: string | null
  createdAt: string
  additions: number
  deletions: number
  changedFiles: number
}

function ghJson<T>(args: string[]): T {
  const stdout = execFileSync('gh', args, {
    encoding: 'utf8',
    // 10 MB is overkill for ~50 issues + ~50 PRs but cheap insurance
    // against a future-Borys with 5000 PRs.
    maxBuffer: 10 * 1024 * 1024,
  })
  return JSON.parse(stdout) as T
}

function fetchIssues(): ReadonlyArray<IssueRecord> {
  const raw = ghJson<ReadonlyArray<RawIssue>>([
    'issue', 'list',
    '--state', 'all',
    '--limit', '500',
    '--json', ISSUE_FIELDS,
  ])
  return raw.map((r) => ({
    number: r.number,
    title: r.title,
    state: r.state === 'CLOSED' ? 'CLOSED' : 'OPEN',
    createdAt: r.createdAt,
    closedAt: r.closedAt,
  }))
}

function fetchMergedPrs(): ReadonlyArray<PullRequestRecord> {
  const raw = ghJson<ReadonlyArray<RawPr>>([
    'pr', 'list',
    '--state', 'merged',
    '--limit', '200',
    '--json', PR_FIELDS,
  ])
  return raw
    .filter((r): r is RawPr & { mergedAt: string } => r.mergedAt !== null)
    .map((r) => ({
      number: r.number,
      title: r.title,
      mergedAt: r.mergedAt,
      createdAt: r.createdAt,
      additions: r.additions,
      deletions: r.deletions,
      changedFiles: r.changedFiles,
    }))
}

export function buildSnapshot(
  issues: ReadonlyArray<IssueRecord>,
  prs: ReadonlyArray<PullRequestRecord>,
  now: Date,
): DashboardSnapshot {
  const classified = classifyAll(issues)
  const weighted = weightIssues(classified, prs)
  const milestones = rollupByMilestone(weighted)
  const velocity = computeVelocity(prs, now, DEFAULT_WINDOW_DAYS)
  const etas = milestones.map((m) => etaForMilestone(m, velocity, now))
  return {
    generatedAt: now.toISOString(),
    milestones,
    etas,
    velocity,
    notMeasured: [
      'Time-in-review per PR — we only see merged commit timestamps, not when a PR sat waiting for review.',
      'Cross-issue dependencies — an open slice that blocks three others isn\'t weighted heavier than a leaf slice of the same LoC.',
      'Bug discovery rate — post-merge regressions surface as new issues with their own weight, not retroactively against the closing PR.',
      'Operational / legal blockers (Impressum copy, DPA signings) — tracked in docs/PRE-GO-LIVE.md, not GitHub Issues; they gate launch but don\'t show up here.',
      'Phase 6+ (evals, polish, community, launch) — out of scope for the "how close is the product" framing; tracked separately in docs/PRE-GO-LIVE.md §7.',
    ],
  }
}

function main(): number {
  const repoRoot = resolve(import.meta.dirname, '..')
  const readmePath = resolve(repoRoot, 'README.md')
  const detailPath = resolve(repoRoot, 'docs/PROGRESS.md')

  const issues = fetchIssues()
  const prs = fetchMergedPrs()
  const snapshot = buildSnapshot(issues, prs, new Date())

  const readmeBlock = renderReadmeBlock(snapshot)
  const detailDoc = renderDetailDoc(snapshot)

  const existingReadme = readFileSync(readmePath, 'utf8')
  const updatedReadme = spliceReadmeBlock(existingReadme, readmeBlock)
  writeFileSync(readmePath, updatedReadme, 'utf8')
  writeFileSync(detailPath, detailDoc, 'utf8')

  console.log(`✓ README.md milestone block refreshed`)
  console.log(`✓ docs/PROGRESS.md written (${detailDoc.length} bytes)`)
  console.log('')
  console.log(readmeBlock)
  return 0
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(main())
}
