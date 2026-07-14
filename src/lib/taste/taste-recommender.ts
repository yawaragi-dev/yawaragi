import {
  type FlavorAxes,
  type FlavorSimilarityMatch,
  findSimilarByFlavor,
} from '@/lib/flavor/flavor-similarity'
import type { TasteEvent } from '@/lib/schemas/taste-event'
import { deriveTasteProfile } from '@/lib/taste/derive-taste-profile'

/**
 * Rank candidate Sakes against a User's derived TasteProfile (CONTEXT.md,
 * ADR-0019). The layer where **brand-exclusion** lives — the pure
 * `findSimilarByFlavor` primitive (#222) is deliberately identity-free, so
 * "don't recommend a sake the user already rated" is applied here, not there.
 *
 * Pure and injectable: the candidate pool is passed in (the surface fetches it
 * from the mirror / MCP), so ranking is unit-testable without IO. Cold start —
 * a User with no TasteEvents — is a signal the caller handles by falling back
 * to "popular this season" (rankings), because ranking against the neutral 0.5
 * prior would surface mid-profile sakes, not genuine recommendations.
 */

/** A rankable candidate: a six-axis vector plus the brandId used for exclusion. */
export interface FlavorCandidate extends FlavorAxes {
  readonly brandId: number
}

/**
 * BrandIds the User has already interacted with via a rating or scan-accept —
 * excluded from recommendations. Cross-beverage seeds carry no brandId (they're
 * a descriptor, not a Sake) so they contribute nothing to the exclusion set.
 */
export function ratedBrandIds(events: readonly TasteEvent[]): Set<number> {
  const ids = new Set<number>()
  for (const event of events) {
    if (event.kind === 'rating' || event.kind === 'scan_accept') {
      ids.add(event.brandId)
    }
  }
  return ids
}

/** A profile with no events — the caller should show "popular this season". */
export function isColdStart(events: readonly TasteEvent[]): boolean {
  return events.length === 0
}

/**
 * Rank candidates against a derived taste `vector`, nearest first, dropping any
 * brand in `excludeBrandIds`. Delegates the flavor math to `findSimilarByFlavor`
 * (which also drops candidates with a missing/NaN axis).
 */
export function recommendByTasteProfile<T extends FlavorCandidate>(
  vector: FlavorAxes,
  candidates: readonly T[],
  options: { excludeBrandIds?: ReadonlySet<number>; limit?: number } = {},
): FlavorSimilarityMatch<T>[] {
  const { excludeBrandIds, limit } = options
  const pool =
    excludeBrandIds && excludeBrandIds.size > 0
      ? candidates.filter((candidate) => !excludeBrandIds.has(candidate.brandId))
      : candidates
  return findSimilarByFlavor(vector, pool, { limit })
}

export type TasteRecommendationResult<T> =
  | { kind: 'cold_start' }
  | { kind: 'ranked'; results: FlavorSimilarityMatch<T>[] }

/**
 * The one-call recommender: given a User's TasteEvents and a candidate pool,
 * either signal cold start (no events) or return candidates ranked against the
 * derived vector with the User's already-rated brands excluded.
 *
 * `now` is passed through to the derivation (time-decay) so the whole thing
 * stays a pure, deterministic function.
 */
export function recommendFromTasteEvents<T extends FlavorCandidate>(
  events: readonly TasteEvent[],
  candidates: readonly T[],
  now: number,
  options: { limit?: number } = {},
): TasteRecommendationResult<T> {
  if (isColdStart(events)) {
    return { kind: 'cold_start' }
  }
  const vector = deriveTasteProfile(events, now)
  const results = recommendByTasteProfile(vector, candidates, {
    excludeBrandIds: ratedBrandIds(events),
    limit: options.limit,
  })
  return { kind: 'ranked', results }
}
