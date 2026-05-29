import { z } from 'zod'
import { WithProvenance } from './with-provenance'

// Phase 2 stub: schema is exported but intentionally unused until Phase 5
// ships the hand-curated table and UI. PRD #21 ("Out of Scope" → "Cross-beverage
// map") calls out reserving the schema here so Phase 5 only adds data + UI.
//
// Shape is the minimal record Phase 5 needs: a Western beverage descriptor
// (e.g. "smoky", "tannic", "hoppy"), the beverage kind, and a target position
// on the 6-axis flavor chart. WithProvenance contributes the optional
// `confidence`; `source` is pinned to the literal here to make every
// CrossBeverageMap row self-identify as heuristic so the UI renders the
// HeuristicDisclaimer (see CONTEXT.md "CrossBeverageMap").
export const CrossBeverageMapSchema = WithProvenance.extend({
  source: z.literal('cross_beverage_map'),
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
