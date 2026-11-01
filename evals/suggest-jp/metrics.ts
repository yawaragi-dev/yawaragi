/**
 * Recall metrics for `pnpm eval suggest-jp` (#289).
 *
 * The ground-truth sets are deliberately loose — a seed query accepts
 * any of 8 neighbours, a descriptor query any of 10 brands — but the
 * suggest list is only 3–5 long. Plain recall@k divides by the size of
 * the answer key, so a query with 10 accepted brands can never score
 * above 5/10 = 0.50 at k=5, however good the answer. Across the 15
 * queries the best a perfect run could reach was a mean r@3 of 0.514
 * and r@5 of 0.679, which made a real regression indistinguishable
 * from the ceiling.
 *
 * The headline is therefore **normalized recall@k**: hits divided by
 * `min(k, |expected|)`, the most hits the top k could possibly hold.
 * A perfect run scores 1.0 whatever the answer key's size. Raw recall
 * and its ceiling (`attainable`) stay in the output so the numbers
 * documented before #289 remain comparable.
 *
 * Pure functions, no I/O — `metrics.test.ts` pins the arithmetic, the
 * only part of this eval CI runs.
 */

export interface RecallAtK {
  /** Distinct expected brands found in the top k. */
  hits: number
  /** `hits / |expected|` — the pre-#289 number, capped by the answer key's size. */
  raw: number
  /** `min(k, |expected|) / |expected|` — the best `raw` can be for this query. */
  attainable: number
  /** `hits / min(k, |expected|)` — the headline: 1.0 is a perfect top k. */
  normalized: number
}

/**
 * Score the first `k` returned brand ids against the expected set.
 *
 * Hits are counted over the set intersection: a brand id returned twice
 * inside the top k counts once. An empty expected set scores 0 across
 * the board (the ground-truth schema rejects one, so this is defence,
 * not a case the eval meets).
 */
export function recallAtK(
  returned: readonly number[],
  expected: readonly number[],
  k: number,
): RecallAtK {
  if (!Number.isInteger(k) || k < 1) {
    throw new RangeError(`recallAtK: k must be a positive integer, got ${k}`)
  }
  const expectedSet = new Set(expected)
  if (expectedSet.size === 0) return { hits: 0, raw: 0, attainable: 0, normalized: 0 }

  const hitIds = new Set<number>()
  for (const id of returned.slice(0, k)) {
    if (expectedSet.has(id)) hitIds.add(id)
  }
  const hits = hitIds.size
  const reachable = Math.min(k, expectedSet.size)
  return {
    hits,
    raw: hits / expectedSet.size,
    attainable: reachable / expectedSet.size,
    normalized: hits / reachable,
  }
}

/** Mean of each field over a list of per-query scores; `null` for an empty list. */
export function meanRecall(scores: readonly RecallAtK[]): Omit<RecallAtK, 'hits'> | null {
  if (scores.length === 0) return null
  const sum = (pick: (s: RecallAtK) => number) =>
    scores.reduce((total, s) => total + pick(s), 0) / scores.length
  return {
    raw: sum((s) => s.raw),
    attainable: sum((s) => s.attainable),
    normalized: sum((s) => s.normalized),
  }
}
