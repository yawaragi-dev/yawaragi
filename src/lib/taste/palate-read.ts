import { FLAVOR_AXES, type FlavorAxis } from '@/lib/schemas/flavor-chart'
import type { FlavorProfile } from '@/lib/schemas/flavor-profile'

/**
 * The arithmetic behind §12's Palate screen — the parts worth testing without
 * a browser or a database.
 *
 * §12 states the rules plainly: the title is "the strongest axis, e.g. 'Rich,
 * umami-forward', at ≥3 tastings; 'Taking shape' at 1–2; 'Not yet' at 0", the
 * confidence is `min(n/10, 1)` (CONTEXT.md § Palate), and each axis row
 * carries "a word label ('More than most' / 'About average' (±6) / 'Less than
 * most')". Every one of those is a pure function of a profile and a count, so
 * none of it belongs inside a server component where it can only be tested
 * through a rendered page.
 */

/** §12's three stages, keyed on how many tastings have been rated. */
export type PalateStage = 'none' | 'taking_shape' | 'read'

/**
 * A seed does NOT advance the stage.
 *
 * §12's cold-start card says so: "Real ratings replace the seed from 3
 * tastings." A cross-beverage seed produces a usable profile from zero
 * tastings, and treating that as a read would tell a visitor who has rated
 * nothing that we know their palate — which is the opposite of what the
 * caveat line beside the seed says.
 */
export function palateStage(ratingCount: number): PalateStage {
  if (ratingCount <= 0) return 'none'
  if (ratingCount < PALATE_READ_THRESHOLD) return 'taking_shape'
  return 'read'
}

/** §12: "Your palate appears after three tastings." */
export const PALATE_READ_THRESHOLD = 3

/** CONTEXT.md § Palate: "confidence is `min(n/10, 1)`". */
export const PALATE_FIRM_THRESHOLD = 10

export function palateConfidence(ratingCount: number): number {
  if (ratingCount <= 0) return 0
  return Math.min(ratingCount / PALATE_FIRM_THRESHOLD, 1)
}

/**
 * The two axes the title names: the strongest, and the next strongest.
 *
 * Ties break on canonical `f1..f6` order rather than arbitrarily, so the same
 * profile always produces the same title — a palate whose title flickered
 * between two equal axes on reload would read as the app changing its mind.
 */
export interface PalateLean {
  readonly top: FlavorAxis
  readonly second: FlavorAxis
}

export function palateLean(profile: FlavorProfile): PalateLean {
  const ranked = [...FLAVOR_AXES].sort((a, b) => {
    const delta = profile[b] - profile[a]
    // Descending by value; canonical order on a tie (indexOf is stable here
    // because FLAVOR_AXES is the canonical order).
    return delta !== 0 ? delta : FLAVOR_AXES.indexOf(a) - FLAVOR_AXES.indexOf(b)
  })
  return { top: ranked[0], second: ranked[1] }
}

/**
 * How one axis compares with the reference — §12's word label.
 *
 * The band is ±6 on the design's 0–100 scale, i.e. ±0.06 here. Without a band
 * every value would read "more" or "less" than the reference, including the
 * ones that are indistinguishable from it, and the row would be noise.
 */
export const PALATE_SAME_BAND = 0.06

export type AxisComparison = 'more' | 'same' | 'less'

export function compareAxis(value: number, reference: number): AxisComparison {
  const delta = value - reference
  if (delta > PALATE_SAME_BAND) return 'more'
  if (delta < -PALATE_SAME_BAND) return 'less'
  return 'same'
}

/**
 * The reference each axis row is read against.
 *
 * §12 draws "a 2px neutral-700 tick for the typical drinker" — the average of
 * everybody else's palate. **We do not have that, and cannot yet**: a
 * population of palates needs aggregated ratings, which in the EU needs the
 * one-time opt-in from §12's own chart card (#297) and a lawful basis that is
 * not yet in ADR-0009's RoPA. Inventing a figure, or quietly using something
 * else under the design's label, would be worse than either.
 *
 * So the reference is the **catalogue's own mean** — the average sake, from
 * the flavour charts we mirror — and the copy says so ("than most sakes",
 * never "than most drinkers"). It answers a real question: the sakes you rate
 * highest are more floral than the average bottle. The tick moves to the
 * drinker average when there is one, and only the copy changes.
 */
export function meanProfile(profiles: readonly FlavorProfile[]): FlavorProfile | null {
  if (profiles.length === 0) return null
  const out = {} as Record<FlavorAxis, number>
  for (const axis of FLAVOR_AXES) {
    let sum = 0
    for (const profile of profiles) sum += profile[axis]
    out[axis] = sum / profiles.length
  }
  return out as FlavorProfile
}
