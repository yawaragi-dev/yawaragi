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
//
// UX-C extension (2026-07-07, #164): each row carries an `exemplars` list
// naming the specific Western bottles / styles the descriptor was distilled
// from. Every exemplar is `source: 'manual_curation'` — the names come from
// `docs/research/cross-beverage-map.md`, not the LLM. The reverse-lookup
// (`src/lib/cross-beverage/reverse-lookup.ts`) uses this data to name a
// familiar Western reference on the scan result card ("Interesting for
// those who like Lagavulin 16"). Exemplar names are proper nouns — they
// stay identical across locales (Riesling Kabinett is not translated).
export const ExemplarSchema = z
  .object({
    source: z.literal('manual_curation'),
    // Proper name (e.g. "Lagavulin 16", "Riesling Kabinett", "Sancerre").
    // Stays verbatim across locales — these are wine/whisky brand or style
    // names, not translatable copy.
    name: z.string().min(1),
    // Optional short pointer at the style family / region for a visitor
    // who might not recognise the exemplar (e.g. "Islay peated single-
    // malt", "off-dry German white"). Kept locale-invariant on purpose:
    // the exemplar hook renders it as a subtle secondary line, and the
    // primary framing message ("Interesting for those who like ...")
    // does the locale work.
    region: z.string().min(1).optional(),
  })
  .strict()
export type Exemplar = z.infer<typeof ExemplarSchema>

export const CrossBeverageMapSchema = withProvenance(z.literal('cross_beverage_map')).extend({
  descriptor: z.string().min(1),
  beverage: z.enum(['whisky', 'wine', 'beer', 'spirit', 'fortified', 'cider']),
  f1: z.number().min(0).max(1),
  f2: z.number().min(0).max(1),
  f3: z.number().min(0).max(1),
  f4: z.number().min(0).max(1),
  f5: z.number().min(0).max(1),
  f6: z.number().min(0).max(1),
  // At least one exemplar per descriptor is the UX-C acceptance-criterion
  // (issue #164). Enforced at the parse seam so the data file cannot ship
  // a row with an empty list — the reverse-lookup counts on every match
  // having something to name.
  exemplars: z.array(ExemplarSchema).min(1),
})
export type CrossBeverageMap = z.infer<typeof CrossBeverageMapSchema>

export const parseCrossBeverageMap = (input: unknown): CrossBeverageMap =>
  CrossBeverageMapSchema.parse(input)
