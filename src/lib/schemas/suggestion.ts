import { z } from 'zod'
import { withProvenance } from './with-provenance'

/**
 * Suggestion — the wire shape emitted by the Phase 4 / S5 suggest server
 * action (`src/lib/suggest/suggest-action.ts`) for each recommended sake in
 * the result list. Distinct from the LabelScanExtraction shape because
 * suggest blends sources at the FIELD level, not the record level:
 *
 *   - `brandId`, `name_ja`, `name_romaji` come out of the Sakenowa MCP
 *     server (canonical reference data).
 *   - `reason` is LLM-inferred prose citing the tool calls the model made.
 *   - `cross_beverage_descriptor` is optional; when present it names the
 *     deterministic-map descriptor that seeded the recommendation
 *     (`smoky`, `tannic`, ...) so the UI can render `<HeuristicDisclaimer />`.
 *
 * Per-field provenance
 * --------------------
 * Each field is a `{ value, source }` object rather than a bare scalar. The
 * card renderer walks the object and mounts a `<ProvenanceBadge />` next to
 * the LLM-inferred + cross-beverage-map fields (CLAUDE.md § "Source
 * provenance"); Sakenowa-sourced fields render the inline
 * `<SakenowaAttribution placement="inline" />` instead. No cross-source
 * silent blending — the card is glance-readable as a mix.
 *
 * The wrapping is done by extending `withProvenance(z.literal(...))`
 * (pinning the source at the parse seam) with a `value` of the appropriate
 * type. Same pattern as `LabelScanExtractionSchema` — the source is a
 * literal string, so a caller who forgets to set it (or mistypes it) fails
 * at parse time.
 */

const BrandIdField = withProvenance(z.literal('sakenowa')).extend({
  // Sakenowa Brand primary key. Positive integer — matches
  // `BrandSchema.brandId` in `src/lib/schemas/brand.ts`. Uses the same
  // int-positive floor so a suggestion for `{ brandId: 0 }` (a common
  // LLM off-by-one when reading tool output) fails at parse.
  value: z.number().int().positive(),
})

const NameJaField = withProvenance(z.literal('sakenowa')).extend({
  value: z.string().min(1),
})

const NameRomajiField = withProvenance(z.literal('sakenowa')).extend({
  // Sakenowa rows carry LLM-transliterated romaji populated by the ingest
  // pipeline (`src/lib/sakenowa/romaji.ts`, PR #121). By convention we
  // still treat it as Sakenowa-sourced here — the MCP tool returns whatever
  // the mirror carries, and the whole record's provenance chain traces to
  // the mirror. A future refactor could split romaji-field provenance into
  // `llm_inferred` (matching the sake-brand detail page's per-field
  // ProvenanceBadge) — for now, mirror the row-level pinning of the
  // BrandSchema to stay in sync with what the MCP client actually returns.
  value: z.string().min(1),
})

const ReasonField = withProvenance(z.literal('llm_inferred')).extend({
  // The LLM's short prose explaining why this sake is a recommended match
  // for the seed. Rendered with `<ProvenanceBadge source="llm_inferred" />`
  // per CLAUDE.md § "Do NOT show LLM-extracted data without a badge".
  //
  // `max(500)` is a defensive cap for the card layout (the model
  // occasionally emits a paragraph when a sentence would do) — real
  // production reasons are typically 60–160 characters. If the model
  // returns a longer string it's rejected at parse time and dropped from
  // the visible result list, which is the right outcome (an over-long
  // reason indicates the model didn't respect the prompt's brevity rule).
  value: z.string().min(1).max(500),
})

const CrossBeverageDescriptorField = withProvenance(
  z.literal('cross_beverage_map'),
).extend({
  // The Western-beverage descriptor (`smoky`, `tannic`, ...) that the
  // `mapCrossBeverage` tool returned when the suggestion was seeded from a
  // cross-beverage bridge. Presence of this field is the sentinel that
  // triggers `<HeuristicDisclaimer />` per CLAUDE.md § "Cross-beverage
  // disclaimers". Absent for pure MCP-driven recommendations (the seed-
  // mode default).
  value: z.string().min(1),
})

export const SuggestionSchema = z.object({
  brandId: BrandIdField,
  name_ja: NameJaField,
  name_romaji: NameRomajiField,
  reason: ReasonField,
  cross_beverage_descriptor: CrossBeverageDescriptorField.optional(),
})

export type Suggestion = z.infer<typeof SuggestionSchema>

export const parseSuggestion = (input: unknown): Suggestion => SuggestionSchema.parse(input)

/**
 * List variant — 3-6 records per the S5 spec. Cap on the upper bound
 * because a card list longer than ~6 stops being scan-able. Lower bound at
 * 0 rather than 3 so the honest empty-state path (`no match` — model found
 * no similar sakes and correctly returned an empty list) can also
 * schema-validate rather than crash the action; the empty case shows the
 * localized `noMatch` copy.
 */
export const SuggestionListSchema = z.array(SuggestionSchema).max(6)

export type SuggestionList = z.infer<typeof SuggestionListSchema>

export const parseSuggestionList = (input: unknown): SuggestionList =>
  SuggestionListSchema.parse(input)
