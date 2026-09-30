import { FLAVOR_AXES, type FlavorAxis } from '@/lib/schemas/flavor-chart'
import { flavorDistance, type FlavorAxes } from './flavor-similarity'

/**
 * The numbers behind a §6 "Similar sakes" row: how similar, and why.
 *
 * §6 gives each row a percentage and "a one-line reason built from the axis
 * differences", e.g. "Just as rich and dry, less floral." This module decides
 * **which axes** that sentence names and what the percentage is. It stops
 * short of composing the sentence on purpose — the wording is i18n's job, and
 * German needs its own phrasing rather than a translated English skeleton — so
 * everything here is locale-free and unit-testable as arithmetic.
 *
 * Deterministic throughout: same inputs, same row, every render. That is what
 * lets the result carry `sakenowa_inferred` rather than a softer provenance
 * (ADR-0005) — no model is involved at any point, which is also §6's own rule:
 * "Plain ranked list, **no chat, no model call**."
 */

/**
 * Width of the "just as" band, in axis units.
 *
 * Both axes are in [0, 1], so 0.08 is 8% of an axis's full travel. Chosen so
 * the band is wide enough that two genuinely similar sakes read as "just as
 * rich" rather than "slightly more rich" — Sakenowa's values carry more
 * precision than a visitor's palate does, and a reason line that hedges every
 * axis says nothing. The boundary is inclusive.
 */
const SHARED_AXIS_TOLERANCE = 0.08

/**
 * How many axes the reason line may call shared.
 *
 * Two. "Just as floral, mellow, rich, mild and dry" is not a one-line reason,
 * and the axes past the first two add precision nobody reads.
 */
const MAX_SHARED_AXES = 2

/**
 * Decay constant for the displayed percentage, in axis units.
 *
 * **Not** `sqrt(6)`, the 6-cube diagonal, which is the obvious choice and is
 * useless: real nearest neighbours sit 0.02–0.05 apart, so measuring them
 * against a theoretical maximum of 2.449 renders every row at 98–99%. The
 * first build of this page did exactly that, and §6's "accent tag at ≥95"
 * fired on all five rows — a number that never varies tells a visitor
 * nothing.
 *
 * So the scale is exponential and tuned to the neighbourhood rather than the
 * extremes: `exp(-d / k)`, with `k` set so that a gap of one
 * {@link SHARED_AXIS_TOLERANCE} on a single axis — the smallest difference
 * this module is willing to call a difference at all — reads as 90%.
 * `k = 0.08 / -ln(0.9)`.
 *
 * The resulting curve: 0 → 100%, 0.04 → 95%, 0.1 → 88%, 0.3 → 67%, 0.6 → 45%.
 * Monotonic, never negative, and ≥95% now means genuinely near-identical,
 * which is what makes the accent tag worth having.
 */
const SIMILARITY_DECAY = 0.08 / -Math.log(0.9)

/**
 * An L2 flavor distance as the "{n}% similar" §6 shows.
 *
 * Exponential decay over {@link SIMILARITY_DECAY}, so the number varies across
 * the range distances actually occupy instead of pinning every row at 99%.
 * Clamped to [0, 100]: a malformed chart row can never render a negative
 * percentage, and only an identical profile reads 100%.
 *
 * **On the metric:** this is L2, matching `flavorDistance`. §6's text says
 * "cosine similarity", and `flavor-similarity.ts` argues at length that cosine
 * is wrong for these axes — magnitude carries the signal, so `f3 = 0.85` and
 * `f3 = 0.15` are opposite poles rather than the same direction at different
 * lengths. We follow the code's reasoning and raised the wording with the
 * designers (#308 §6) rather than silently switching metrics; ordering is what
 * a visitor sees, and L2 orders these vectors the way the domain means.
 */
export function similarityPercent(distance: number): number {
  if (!Number.isFinite(distance) || distance < 0) return 0
  return Math.max(0, Math.min(100, Math.round(100 * Math.exp(-distance / SIMILARITY_DECAY))))
}

/** Which way a candidate's axis sits relative to the target's. */
export type AxisDirection = 'more' | 'less'

export interface FlavorDifference {
  /** Axes close enough to read as shared, nearest first, at most two. */
  readonly sharedAxes: readonly FlavorAxis[]
  /** The one axis worth naming as different, or `null` if none diverges. */
  readonly divergentAxis: { readonly axis: FlavorAxis; readonly direction: AxisDirection } | null
}

/**
 * Pick the axes a §6 reason line should name.
 *
 * Shared axes are the closest ones inside {@link SHARED_AXIS_TOLERANCE},
 * nearest first. The divergent axis is the single largest gap outside it —
 * one, not all, because "less floral" lands and "less floral, more rich, less
 * dry, more mellow" is a data dump.
 *
 * Ties break by the canonical `f1..f6` order so the same two sakes always
 * produce the same sentence. Pure: no IO, no module state, no randomness.
 *
 * **In practice `divergentAxis` is usually `null` on §6's page**, so every row
 * reads "Just as {x} and {y}." and none carries the contrast clause §6's
 * example shows ("…less floral"). That is the data, not a bug: a top-5
 * neighbour sits ~0.05 of total L2 distance away, which bounds every single
 * axis below {@link SHARED_AXIS_TOLERANCE}, so there is honestly no axis worth
 * calling different. The clause earns its keep on a thin-catalogue subject
 * whose nearest neighbour is far — and it must stay correct for the day the
 * caller is not a top-5 list.
 */
export function describeFlavorDifference(
  target: FlavorAxes,
  candidate: FlavorAxes,
): FlavorDifference {
  const gaps = FLAVOR_AXES.map((axis) => ({
    axis,
    signed: candidate[axis] - target[axis],
    size: Math.abs(candidate[axis] - target[axis]),
  }))

  const sharedAxes = gaps
    .filter(({ size }) => size <= SHARED_AXIS_TOLERANCE)
    // Closest first. `FLAVOR_AXES` order is preserved on equal gaps because
    // `Array.prototype.sort` is stable, which is what makes ties deterministic.
    .sort((a, b) => a.size - b.size)
    .slice(0, MAX_SHARED_AXES)
    .map(({ axis }) => axis)

  const widest = gaps
    .filter(({ size }) => size > SHARED_AXIS_TOLERANCE)
    .sort((a, b) => b.size - a.size)[0]

  return {
    sharedAxes,
    divergentAxis: widest
      ? { axis: widest.axis, direction: widest.signed > 0 ? 'more' : 'less' }
      : null,
  }
}

/**
 * Convenience for the page: distance and reason in one pass.
 *
 * Recomputes the distance rather than taking the ranker's, so a caller cannot
 * pair one sake's percentage with another's reason.
 */
export function describeSimilarity(
  target: FlavorAxes,
  candidate: FlavorAxes,
): FlavorDifference & { readonly percent: number } {
  return {
    ...describeFlavorDifference(target, candidate),
    percent: similarityPercent(flavorDistance(target, candidate)),
  }
}
