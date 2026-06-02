import { z } from 'zod'
import { withProvenance } from './with-provenance'

// Two ranking kinds, both per ADR-0002 (rankings-latest-only):
//   - 'overall' — Sakenowa's global top list. areaId is null.
//   - 'area'    — per-prefecture top list (includes the foreign-producer
//                 sentinel areaId 0). areaId is the scope.
//
// ADR-0005 binds source to record kind: Ranking is Sakenowa-mirrored.
// The score IS computed by Sakenowa; we never derive an LLM ranking.
export const RankingKind = z.enum(['overall', 'area'])
export type RankingKind = z.infer<typeof RankingKind>

export const RankingSource = z.enum([
  'sakenowa',
  'sakenowa_inferred',
  'user_corrected',
])
export type RankingSource = z.infer<typeof RankingSource>

export const RankingSchema = withProvenance(RankingSource)
  .extend({
    kind: RankingKind,
    // null for kind='overall'. nonnegative because areaId 0 is the
    // foreign-producer area marker (see CONTEXT.md), not "missing".
    areaId: z.number().int().nonnegative().nullable(),
    rank: z.number().int().positive(),
    brandId: z.number().int().positive(),
    score: z.number(),
  })
  .refine((r) => (r.kind === 'overall' ? r.areaId === null : r.areaId !== null), {
    message: 'areaId must be null for kind=overall and non-null for kind=area',
  })
export type Ranking = z.infer<typeof RankingSchema>

export const parseRanking = (input: unknown): Ranking => RankingSchema.parse(input)
