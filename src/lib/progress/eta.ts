// Turn remaining LoC and a velocity number into a calendar-date band.
// We don't pretend to compute a real binomial-distribution confidence
// interval (we'd need ≥8 sprints of data per the Scrum Alliance
// guidance; we have ~6 weeks of project history). Instead we scale the
// median velocity by 0.5x / 1x / 1.5x and label the result honestly as
// an "optimistic / median / pessimistic" band derived from a small
// sample.

import type { EtaBand, Velocity, MilestoneId, MilestoneEta, MilestoneRollup } from './types'

const MS_PER_DAY = 24 * 60 * 60 * 1000

function addDays(from: Date, days: number): string {
  // Round up: half a day is still a day of work remaining.
  const ms = from.getTime() + Math.ceil(days) * MS_PER_DAY
  return new Date(ms).toISOString().slice(0, 10)
}

export function etaBandFor(
  remainingWeight: number,
  velocity: Velocity,
  now: Date,
): EtaBand | null {
  if (remainingWeight <= 0) return null
  if (velocity.locPerDay <= 0) return null
  const medianDays = remainingWeight / velocity.locPerDay
  return {
    // "Pessimistic" uses 0.5x velocity ⇒ work takes 2x as long; the
    // pairing is intentionally asymmetric because schedule risk is
    // asymmetric: things go wrong more easily than they go right.
    optimistic: addDays(now, medianDays / 1.5),
    median: addDays(now, medianDays),
    pessimistic: addDays(now, medianDays / 0.5),
  }
}

export function etaForMilestone(
  rollup: MilestoneRollup,
  velocity: Velocity,
  now: Date,
): MilestoneEta {
  if (!rollup.scoped) {
    return {
      id: rollup.id,
      remainingWeight: 0,
      eta: null,
      rationale: 'Not yet scoped — no issues filed under this milestone.',
    }
  }
  const remaining = rollup.openWeight
  const eta = etaBandFor(remaining, velocity, now)
  let rationale: string
  if (remaining <= 0) {
    rationale = 'Complete — no open issues under this milestone.'
  } else if (velocity.locPerDay <= 0) {
    rationale = `No PRs merged in the last ${velocity.windowDays} days; ETA undefined.`
  } else {
    rationale = `Based on ${velocity.prCount} PR(s) merged over the last ${velocity.windowDays} days (~${velocity.locPerDay.toFixed(0)} LoC/day).`
  }
  return { id: rollup.id, remainingWeight: remaining, eta, rationale }
}

// Re-exported so the renderer doesn't need to type the union itself.
export type { MilestoneId, MilestoneEta }
