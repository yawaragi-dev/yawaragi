import { z } from 'zod'
import { withProvenance } from './with-provenance'

// Schema for the hand-curated CrossBeverageMap table: a Western beverage
// descriptor (e.g. "smoky", "tannic", "hoppy", "agave-smoky") + the beverage
// category + a target position on the 6-axis flavor chart. Source is pinned
// to the single literal via the `withProvenance` factory so every
// CrossBeverageMap row self-identifies as heuristic and the UI renders the
// HeuristicDisclaimer (see CONTEXT.md "CrossBeverageMap"). Pinning at the
// parse seam means no caller — pipeline, chat tool, future ingest — can
// accidentally widen this.
//
// Phase 4 / S2 extension (2026-06-21, #150): the `beverage` enum was
// `'whisky' | 'wine' | 'beer'` from the original Phase 2 stub. The cross-
// beverage research (#149) showed that spirits (tequila / mezcal / gin /
// shochu / soju / baijiu), additional fortified wines (manzanilla, port —
// distinct from the wine-table sherries), and cider were among the most
// distinctive cross-domain bridges and should land in the recommender from
// day one. Three values added: `spirit`, `fortified`, `cider`. Keep the
// category granular enough to be useful but coarse enough to manage —
// `spirit` covers tequila / mezcal / gin / shochu / soju / baijiu under one
// umbrella; per-distillate distinction lives in the descriptor (e.g.
// `agave-smoky`, `juniper-botanical`).
export const CrossBeverageMapSchema = withProvenance(z.literal('cross_beverage_map')).extend({
  descriptor: z.string().min(1),
  beverage: z.enum(['whisky', 'wine', 'beer', 'spirit', 'fortified', 'cider']),
  f1: z.number().min(0).max(1),
  f2: z.number().min(0).max(1),
  f3: z.number().min(0).max(1),
  f4: z.number().min(0).max(1),
  f5: z.number().min(0).max(1),
  f6: z.number().min(0).max(1),
})
export type CrossBeverageMap = z.infer<typeof CrossBeverageMapSchema>

export const parseCrossBeverageMap = (input: unknown): CrossBeverageMap =>
  CrossBeverageMapSchema.parse(input)
