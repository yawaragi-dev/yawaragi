// Roll up weighted issues into the three milestone buckets the
// dashboard renders. Kept separate from `weighting.ts` so the
// classification → weighting → bucketing pipeline reads top-down.

import type { MilestoneId, MilestoneRollup, WeightedIssue } from './types'

interface MilestoneSpec {
  id: MilestoneId
  label: string
  phaseLabel: string
  description: string
}

export const MILESTONES: ReadonlyArray<MilestoneSpec> = [
  {
    id: 'M1',
    label: 'Compliance & i18n foundation',
    phaseLabel: 'Phase 0',
    description:
      'Age gate (JMStV), cookie banner (GDPR), next-intl (en+de), EN-first launch, breach runbook.',
  },
  {
    id: 'M2',
    label: 'Data foundation',
    phaseLabel: 'Phase 2',
    description:
      'Sakenowa Postgres mirror, Zod schemas with provenance, attribution UI, flavor chart, Clerk integration.',
  },
  {
    id: 'M3',
    label: 'Flagship surfaces',
    phaseLabel: 'Phases 3–5',
    description:
      'Label scan (vision LLM), chat recommender (AI SDK tools + MCP), taste profile + cross-beverage map.',
  },
]

export function rollupByMilestone(
  weighted: ReadonlyArray<WeightedIssue>,
): ReadonlyArray<MilestoneRollup> {
  return MILESTONES.map((spec) => {
    // Slice issues only: the "Phase N Slice M" pattern is the project's
    // unit of delivery. Phase-referencing docs / chore tickets (e.g. a
    // CONTEXT.md update that mentions "Phase 0") sit alongside the
    // slices but aren't themselves slices; excluding them keeps the
    // closed/open ratio meaningful as those side-quest tickets accrue.
    const inMilestone = weighted.filter(
      (w) => w.milestone === spec.id && w.isSlice,
    )
    const closed = inMilestone.filter((w) => w.issue.state === 'CLOSED')
    const open = inMilestone.filter((w) => w.issue.state === 'OPEN')
    return {
      id: spec.id,
      label: spec.label,
      phaseLabel: spec.phaseLabel,
      description: spec.description,
      closedCount: closed.length,
      openCount: open.length,
      closedWeight: closed.reduce((s, w) => s + w.weight, 0),
      openWeight: open.reduce((s, w) => s + w.weight, 0),
      // A milestone is "scoped" if at least one slice issue exists
      // under it. Phase 3+ currently has no slices filed; we surface
      // that as "not measured" rather than render a misleading 0/0.
      scoped: inMilestone.length > 0,
    }
  })
}
