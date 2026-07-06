import { z } from 'zod'
import { MAX_FREEFORM_QUERY_LEN } from '@/lib/suggest/suggest-action-state'

/**
 * Phase 4 / S7 (#145) — Zod schemas for the `evals/suggest-jp/` harness.
 *
 * The eval loads `queries.ts` + `ground-truth.ts` as typed TypeScript
 * modules; the schemas below are the runtime validation seam. Two
 * reasons to keep the schemas even though the source files are already
 * `.ts`:
 *
 *   1. Defence-in-depth against a `queries.json` sidecar (or a
 *      dynamically constructed query set) drifting from the type
 *      shape — the runner calls `.parse()` after import so an
 *      out-of-shape object crashes with a readable error, not a
 *      silent metric miscalculation.
 *   2. `MAX_FREEFORM_QUERY_LEN` is enforced identically to the
 *      production action's input seam (`src/lib/suggest/suggest-action.ts`).
 *      A query set that would trigger `invalid_input: query_too_long`
 *      in production gets caught at eval-load time instead of
 *      producing a mysterious 0% recall.
 */

/**
 * A single eval query. Two modes matching the suggest surface's own
 * two paths (seed-based from `/sake/[brandId]?seed=<id>` and freeform
 * from `?q=<string>`); the runner routes each to the matching
 * `suggestAction` seed shape.
 *
 * `id` is a stable slug used as the ground-truth key AND for the
 * progress / summary output — pick something readable
 * (`brand-1-similar`, `freeform-smoky-whisky`) so the operator can
 * grep the output.
 */
export const QuerySchema = z.discriminatedUnion('mode', [
  z.object({
    id: z.string().min(1),
    mode: z.literal('seed'),
    brandId: z.number().int().positive(),
    notes: z.string().optional(),
  }),
  z.object({
    id: z.string().min(1),
    mode: z.literal('freeform'),
    query: z.string().min(1).max(MAX_FREEFORM_QUERY_LEN),
    notes: z.string().optional(),
  }),
])

export type Query = z.infer<typeof QuerySchema>

export const QueryListSchema = z.array(QuerySchema)

/**
 * Ground truth entry — the set of Sakenowa brandIds that constitute
 * an "acceptable" answer for a given query. Recall@k is
 * `intersect(returned_topK, expected) / expected.length`.
 *
 * `rationale` is a short human note explaining WHY those brandIds are
 * the right answer — critical for anyone re-curating the set later.
 * The eval doesn't consume it; it's for the reader.
 *
 * Notes on cardinality:
 *
 *   - `expectedBrandIds` may hold more than K entries. The eval takes
 *     the intersection with the top-K returned, so a larger expected
 *     set is a looser bar (more brands "count" as correct).
 *   - Empty expected sets are rejected — a query with no known
 *     acceptable answer can't be scored, so it doesn't belong in the
 *     harness. Remove it or add answers instead.
 */
export const GroundTruthEntrySchema = z.object({
  queryId: z.string().min(1),
  expectedBrandIds: z.array(z.number().int().positive()).min(1),
  rationale: z.string().min(1),
})

export type GroundTruthEntry = z.infer<typeof GroundTruthEntrySchema>

export const GroundTruthListSchema = z.array(GroundTruthEntrySchema)
