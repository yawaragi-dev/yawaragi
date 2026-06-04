import { z } from 'zod'
import { withProvenance } from './with-provenance'

// Phase 2 stub: schema is exported but intentionally unused until Phase 5
// ships the hand-curated table and UI. PRD #21 ("Out of Scope" → "Cross-beverage
// map") calls out reserving the schema here so Phase 5 only adds data + UI.
//
// Shape is the minimal record Phase 5 needs: a Western beverage descriptor
// (e.g. "smoky", "tannic", "hoppy"), the beverage kind, and a target position
// on the 6-axis flavor chart. Source is pinned to the single literal via
// the `withProvenance` factory so every CrossBeverageMap row self-identifies
// as heuristic and the UI renders the HeuristicDisclaimer (see CONTEXT.md
// "CrossBeverageMap"). Pinning at the parse seam means no caller — pipeline,
// chat tool, future ingest — can accidentally widen this.
export const CrossBeverageMapSchema = withProvenance(z.literal('cross_beverage_map')).extend({
  descriptor: z.string().min(1),
  beverage: z.enum(['whisky', 'wine', 'beer']),
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
