import { z } from 'zod'
import { withProvenance } from './with-provenance'

// A LabelScanExtraction is the structured result the vision provider
// returns from a bottle-label image. Phase 3 / S1 ships a hardcoded
// extraction (Dassai / Asahi Shuzo) so the wire shape, schema, lookup,
// and result UI can be exercised end-to-end without burning Anthropic
// credit — S3 (#108) wires the real Haiku 4.5 call.
//
// ADR-0005 binds `source` to record kind. A LabelScanExtraction can ONLY
// originate from a vision LLM reading a label image — no other taxonomy
// value applies. We pin to the single literal `'llm_extracted'` (rather
// than a 1-value enum) following the PR #100 pattern used by
// IngestionRunSchema, so any caller that quietly tries to relabel an LLM
// guess as e.g. `'sakenowa'` throws at parse time.
//
// `confidence` is REQUIRED here (not optional, as on the WithProvenance
// mixin), because confidence-based tier resolution drives the downstream
// auto/confirm/retry UX (PRD #105 §"Confidence tier resolver"). A vision
// extraction without a confidence number is meaningless.
//
// `name_ja` and `brewery_ja` are the kanji/kana fields the lookup joins
// on. CONTEXT.md "Same-romaji collisions are possible" — we never look up
// by romaji at this seam; the canonical match is on Japanese script.
export const LabelScanExtractionSchema = withProvenance(z.literal('llm_extracted'))
  .extend({
    name_ja: z.string().min(1),
    brewery_ja: z.string().min(1),
    /**
     * Every other name the label prints for this sake: the product or
     * sub-line beside the brand (縁, あわ咲き, "Gold"), and the brand in
     * another script (HANATOMOE beside 花巴, a furigana reading). The
     * catalogue often holds a sub-line as its own row, and a brand the
     * model misreads in brush kanji is often printed legibly in kana or
     * Latin beside it; the lookup uses these to pick the more specific row
     * or to recover a miss. Optional: absent on reads made before the field
     * existed and from providers that do not fill it.
     */
    other_names: z.array(z.string().min(1)).max(6).optional(),
  })
  .extend({
    confidence: z.number().min(0).max(1),
  })

export type LabelScanExtraction = z.infer<typeof LabelScanExtractionSchema>

export const parseLabelScanExtraction = (input: unknown): LabelScanExtraction =>
  LabelScanExtractionSchema.parse(input)
