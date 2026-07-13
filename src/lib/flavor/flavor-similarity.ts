/**
 * Shared six-axis flavor-vector similarity. The single in-repo home for
 * distance/ranking over the Sakenowa f1–f6 axes.
 *
 * Consolidated from the cross-beverage reverse-lookup path (issue #164) during
 * the Phase 5 architecture pass (#220): the reverse hook and the Phase 5
 * personalised recommender both need "rank candidates by flavor distance", so
 * the metric lives here once and both call it.
 *
 * ## Metric: L2 (Euclidean), not cosine — and why the cosine path is elsewhere
 *
 * This module is L2-only, on purpose. The axes are each in [0, 1] and their
 * **magnitude carries real signal**: `f3 = 0.85 juko` and `f3 = 0.15 juko` are
 * opposite poles, not "the same direction, different length". Cosine similarity
 * would treat two mid-value profiles as near-identical regardless of how
 * intense each axis actually is — wrong for this domain.
 *
 * The one cosine implementation in the system lives deliberately apart, in SQL
 * inside `@yawaragi/sakenowa-mcp`'s `find_similar_sakes` tool (brand-to-brand
 * "more like this" over the `flavor_charts` table). That path ranks in the
 * database and never materialises a JS vector, so there is nothing to unify
 * here — the two metrics are a considered divergence, not duplication. If a
 * JS-side cosine is ever needed, add it as an explicit strategy rather than
 * silently changing this function's meaning.
 */

/**
 * The six-axis input shape. Intentionally **structural** (not the
 * `FlavorProfile` / `FlavorChart` Zod types) so callers don't couple to a
 * branded type — a Sakenowa `FlavorChart`, an LLM-extracted `FlavorProfile`, a
 * `CrossBeverageMap` row, the MCP wire object, or a plain test fixture all
 * satisfy it. Values are expected in [0, 1] but nothing here clamps: a bad
 * input simply yields a large distance (fail-open), which the caller's
 * threshold/limit handles.
 */
export interface FlavorAxes {
  readonly f1: number
  readonly f2: number
  readonly f3: number
  readonly f4: number
  readonly f5: number
  readonly f6: number
}

/**
 * L2 (Euclidean) distance between two six-axis vectors.
 *
 * Range: `[0, sqrt(6)] ≈ [0, 2.449]` since each axis is in [0, 1] over six
 * axes. Both inputs are `readonly` so a bug that mutates the source vector
 * surfaces at call time. Exported so the arithmetic is pinned by unit tests —
 * a change to the formula breaks pre-computed expected distances, not just
 * downstream ranking behaviour.
 */
export function flavorDistance(a: FlavorAxes, b: FlavorAxes): number {
  const d1 = a.f1 - b.f1
  const d2 = a.f2 - b.f2
  const d3 = a.f3 - b.f3
  const d4 = a.f4 - b.f4
  const d5 = a.f5 - b.f5
  const d6 = a.f6 - b.f6
  return Math.sqrt(d1 * d1 + d2 * d2 + d3 * d3 + d4 * d4 + d5 * d5 + d6 * d6)
}

/** A candidate paired with its L2 distance to the ranking target. */
export interface FlavorSimilarityMatch<T> {
  readonly candidate: T
  readonly distance: number
}

export interface FindSimilarOptions {
  /**
   * Maximum number of matches to return, nearest first. Omit to return every
   * (surviving) candidate, ranked.
   */
  readonly limit?: number
  /**
   * Drop candidates whose L2 distance to the target exceeds this. The boundary
   * is **inclusive** — a candidate at exactly `maxDistance` is kept. Omit to
   * keep all candidates regardless of distance.
   */
  readonly maxDistance?: number
}

/**
 * Rank `candidates` by L2 flavor distance to `target`, nearest first.
 *
 * The generic sibling of the cross-beverage `findNearestExemplars`: where that
 * one is specialised to descriptor rows (exemplar dedupe, a fixed honesty
 * threshold), this is the plain "nearest sakes to a target vector" primitive
 * the Phase 5 recommender ranks a candidate pool against the session taste
 * vector with.
 *
 * Deterministic: ties (equal distance) break by original input order, so the
 * same inputs always yield the same ordering — a unit test can pin the result.
 * Pure — no IO, no module state, no randomness.
 */
export function findSimilarByFlavor<T extends FlavorAxes>(
  target: FlavorAxes,
  candidates: readonly T[],
  options: FindSimilarOptions = {},
): FlavorSimilarityMatch<T>[] {
  const { limit, maxDistance } = options

  const ranked = candidates
    .map((candidate, index) => ({ candidate, index, distance: flavorDistance(target, candidate) }))
    .filter(({ distance }) => maxDistance === undefined || distance <= maxDistance)
    // Distance ascending; stable tie-break on input index so equidistant
    // candidates keep their original relative order deterministically.
    .sort((a, b) => a.distance - b.distance || a.index - b.index)

  const kept = limit === undefined ? ranked : ranked.slice(0, limit)
  return kept.map(({ candidate, distance }) => ({ candidate, distance }))
}
