// Render the dashboard snapshot to two markdown surfaces:
//
//   1. A compact block embedded in README.md between explicit marker
//      comments. The README is the recruiter-facing source of truth,
//      so the block is short, no-scroll, and links to (2) for detail.
//   2. The full report at docs/PROGRESS.md — every milestone with bar
//      art, ETA band, rationale, and the "not measured" disclosures.
//
// Both surfaces include the generation timestamp verbatim so a stale
// dashboard reads as obviously stale instead of confidently wrong.

import type {
  DashboardSnapshot,
  MilestoneEta,
  MilestoneRollup,
} from './types'

export const README_BEGIN_MARKER = '<!-- progress:start -->'
export const README_END_MARKER = '<!-- progress:end -->'

const BAR_WIDTH = 20
const BAR_FILLED = '█' // U+2588 FULL BLOCK
const BAR_EMPTY = '░' // U+2591 LIGHT SHADE

export function progressBar(closed: number, total: number, width = BAR_WIDTH): string {
  if (total <= 0) return BAR_EMPTY.repeat(width)
  const ratio = Math.max(0, Math.min(1, closed / total))
  const filled = Math.round(ratio * width)
  return BAR_FILLED.repeat(filled) + BAR_EMPTY.repeat(width - filled)
}

export function percentString(closed: number, total: number): string {
  if (total <= 0) return 'n/a'
  return `${Math.round((closed / total) * 100)}%`
}

function totalWeight(m: MilestoneRollup): number {
  return m.closedWeight + m.openWeight
}

function shortLabel(m: MilestoneRollup): string {
  return `${m.id} (${m.phaseLabel}) — ${m.label}`
}

// ---------- README block (compact) ----------------------------------

export function renderReadmeBlock(snap: DashboardSnapshot): string {
  const lines: string[] = []
  lines.push(README_BEGIN_MARKER)
  lines.push('')
  lines.push('## Milestone progress')
  lines.push('')
  lines.push(
    `_Snapshot generated ${snap.generatedAt.slice(0, 10)} from GitHub Issues + merged PRs. Regenerate with \`pnpm progress\`. Detail: [docs/PROGRESS.md](./docs/PROGRESS.md)._`,
  )
  lines.push('')
  lines.push('| Milestone | Progress | Issues | ETA (median) |')
  lines.push('| --- | --- | --- | --- |')
  for (const m of snap.milestones) {
    const eta = snap.etas.find((e) => e.id === m.id)
    let progress: string
    let etaText: string
    let issuesText: string
    if (!m.scoped) {
      progress = `\`${progressBar(0, 0)}\` n/a`
      etaText = 'not scoped'
      issuesText = '— / —'
    } else {
      const total = totalWeight(m)
      progress = `\`${progressBar(m.closedWeight, total)}\` ${percentString(m.closedWeight, total)}`
      etaText = eta && eta.eta ? eta.eta.median : eta && eta.remainingWeight <= 0 ? 'done' : 'undefined'
      issuesText = `${m.closedCount} / ${m.closedCount + m.openCount}`
    }
    lines.push(`| **${shortLabel(m)}** | ${progress} | ${issuesText} | ${etaText} |`)
  }
  lines.push('')
  lines.push(README_END_MARKER)
  return lines.join('\n')
}

// ---------- docs/PROGRESS.md (full) ---------------------------------

function etaSection(m: MilestoneRollup, eta: MilestoneEta | undefined): string {
  if (!eta) return '_ETA unavailable._'
  if (!m.scoped) return `_${eta.rationale}_`
  if (!eta.eta) return `_${eta.rationale}_`
  return [
    `- **Optimistic:** ${eta.eta.optimistic}`,
    `- **Median:**     ${eta.eta.median}`,
    `- **Pessimistic:** ${eta.eta.pessimistic}`,
    '',
    `_${eta.rationale}_`,
  ].join('\n')
}

export function renderDetailDoc(snap: DashboardSnapshot): string {
  const lines: string[] = []
  lines.push('# Milestone progress (detail)')
  lines.push('')
  lines.push(`_Snapshot generated ${snap.generatedAt} (UTC). Regenerate with \`pnpm progress\`._`)
  lines.push('')
  lines.push('## TL;DR')
  lines.push('')
  lines.push('| Milestone | Phases | Closed / Total issues | Closed / Total LoC weight | Bar |')
  lines.push('| --- | --- | --- | --- | --- |')
  for (const m of snap.milestones) {
    if (!m.scoped) {
      lines.push(
        `| **${m.id}** — ${m.label} | ${m.phaseLabel} | not scoped | not scoped | \`${progressBar(0, 0)}\` |`,
      )
      continue
    }
    const total = totalWeight(m)
    lines.push(
      `| **${m.id}** — ${m.label} | ${m.phaseLabel} | ${m.closedCount} / ${m.closedCount + m.openCount} | ${m.closedWeight} / ${total} (${percentString(m.closedWeight, total)}) | \`${progressBar(m.closedWeight, total)}\` |`,
    )
  }
  lines.push('')
  lines.push('## Per-milestone detail')
  lines.push('')
  for (const m of snap.milestones) {
    const eta = snap.etas.find((e) => e.id === m.id)
    lines.push(`### ${m.id} — ${m.label} (${m.phaseLabel})`)
    lines.push('')
    lines.push(m.description)
    lines.push('')
    if (!m.scoped) {
      lines.push('_No issues filed under this milestone yet._')
      lines.push('')
      lines.push(etaSection(m, eta))
      lines.push('')
      continue
    }
    const total = totalWeight(m)
    lines.push(`**Issues:** ${m.closedCount} closed / ${m.closedCount + m.openCount} total`)
    lines.push('')
    lines.push(`**Weight (LoC of merged PRs):** ${m.closedWeight} closed / ${total} total — ${percentString(m.closedWeight, total)} done`)
    lines.push('')
    lines.push(`\`${progressBar(m.closedWeight, total, 40)}\``)
    lines.push('')
    lines.push('**ETA**')
    lines.push('')
    lines.push(etaSection(m, eta))
    lines.push('')
  }
  lines.push('## Methodology')
  lines.push('')
  lines.push(
    `- **Milestones** map to project phases: ${snap.milestones
      .map((m) => `${m.id} = ${m.phaseLabel}`)
      .join(', ')}. Phase 6+ (evals, polish, community, launch) is excluded — it gates the launch but isn't product surface.`,
  )
  lines.push(
    '- **Weight per issue** is the sum of `additions + deletions` of the merged PR(s) that closed it (matched by `closes #N` in the PR title). LoC is a blunt instrument but it is measurable, reproducible, and immune to retroactive sizing.',
  )
  lines.push(
    '- **Open issues** inherit the median measured slice weight as a prior; the dashboard labels this fall-back so it isn\'t confused with measured data.',
  )
  lines.push(
    `- **Velocity** is total LoC merged in the trailing ${snap.velocity.windowDays} days divided by the window length in days. Idle days count against velocity: \`${snap.velocity.totalLoc}\` LoC across \`${snap.velocity.prCount}\` PR(s) ⇒ \`${snap.velocity.locPerDay.toFixed(1)}\` LoC/day.`,
  )
  lines.push(
    '- **ETA band** is `remaining_weight / velocity` scaled by 1.5x (optimistic), 1x (median), and 0.5x (pessimistic). The 0.5x/1.5x band is wide on purpose — it is not a binomial confidence interval (we lack the ≥8 sprints of history that would justify one), it is a sanity-check window.',
  )
  lines.push('')
  lines.push('## What is NOT measured')
  lines.push('')
  for (const line of snap.notMeasured) lines.push(`- ${line}`)
  lines.push('')
  return lines.join('\n')
}

export function spliceReadmeBlock(readme: string, block: string): string {
  const begin = readme.indexOf(README_BEGIN_MARKER)
  const end = readme.indexOf(README_END_MARKER)
  if (begin === -1 || end === -1 || end < begin) {
    throw new Error(
      `README is missing the ${README_BEGIN_MARKER} / ${README_END_MARKER} marker pair`,
    )
  }
  const before = readme.slice(0, begin)
  const after = readme.slice(end + README_END_MARKER.length)
  return `${before}${block}${after}`
}
