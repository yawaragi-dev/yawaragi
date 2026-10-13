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
// `name_ja` and `brewery_ja` are the fields the lookup joins on, in the
// script the label prints them. Japanese script is matched first; a name or
// brewery read in Latin (an importer's back label) or in kana is compared
// with the catalogue's romaji, and counts as a sure match only where a
// second field agrees — CONTEXT.md "Same-romaji collisions are possible".
/**
 * What the photo shows. The scan answers "which sake is this bottle"; a
 * menu page or a row of bottles has no one answer to that.
 */
export const ScanSubjectSchema = z.enum(['one_bottle', 'several_bottles', 'menu', 'no_bottle'])
export type ScanSubject = z.infer<typeof ScanSubjectSchema>

/**
 * Whether there was writing to read. A sharp photo of the side of a bottle
 * that carries a drawing and no text is not an unclear photo, and telling the
 * visitor to retake it sends them round in a circle; `no_text` lets the scan
 * say "turn the bottle" instead.
 */
export const ScanLegibilitySchema = z.enum(['read', 'unclear', 'no_text'])
export type ScanLegibility = z.infer<typeof ScanLegibilitySchema>

/**
 * What the bottle holds, as its label says. The catalogue is sake only, and
 * makers of shochu, awamori and plum liqueur often brew sake too, so a
 * shochu bottle read as a sake lands on the maker's sake. Anything but
 * `sake` and `unknown` is only to be answered from a word printed in the
 * photo (焼酎, 泡盛, 梅酒, リキュール); `unknown` is the honest answer for a
 * label that prints the name alone.
 */
export const ScanDrinkSchema = z.enum(['sake', 'shochu', 'awamori', 'umeshu', 'liqueur', 'other', 'unknown'])
export type ScanDrink = z.infer<typeof ScanDrinkSchema>

/** The drinks the scan can say a bottle is instead of sake. */
export type NonSakeDrink = Exclude<ScanDrink, 'sake' | 'unknown'>

export function nonSakeDrinkOf(extraction: { drink?: ScanDrink }): NonSakeDrink | null {
  const drink = extraction.drink
  return drink === undefined || drink === 'sake' || drink === 'unknown' ? null : drink
}

/** The grade (特定名称) a label prints. A sake (line) has none; a bottling does. */
export const ScanGradeSchema = z.enum([
  'junmai_daiginjo',
  'daiginjo',
  'junmai_ginjo',
  'ginjo',
  'tokubetsu_junmai',
  'junmai',
  'tokubetsu_honjozo',
  'honjozo',
  'futsushu',
])
export type ScanGrade = z.infer<typeof ScanGradeSchema>

/** Style words a label prints beside the grade. */
export const ScanStyleSchema = z.enum([
  'nama',
  'namachozo',
  'namazume',
  'genshu',
  'muroka',
  'nigori',
  'sparkling',
  'koshu',
  'kimoto',
  'yamahai',
  'taruzake',
  'kijoshu',
  'hiyaoroshi',
])
export type ScanStyle = z.infer<typeof ScanStyleSchema>

/**
 * What the label says about this particular bottling, beyond the sake
 * (line) the lookup finds: the catalogue knows 水尾, the label says 一味,
 * 純米. Only what is printed in the photo; every part is optional. Used to
 * recognise one of the visitor's own bottlings and to fill in the name when
 * they add one.
 */
export const ScanBottlingSchema = z.object({
  /** The product name beside the brand, as printed: 一味, 縁, "Wandering Poet". */
  product_name: z.string().optional(),
  /** `product_name` in Latin letters, as printed or as read (一味 → Ichiaji). */
  product_name_romaji: z.string().optional(),
  grade: ScanGradeSchema.optional(),
  styles: z.array(ScanStyleSchema).optional(),
  /** Polishing ratio in percent, as printed (精米歩合 60% → 60). */
  polishing_ratio: z.number().min(1).max(100).optional(),
})
export type ScanBottling = z.infer<typeof ScanBottlingSchema>

export const LabelScanExtractionSchema = withProvenance(z.literal('llm_extracted'))
  .extend({
    /** Optional: absent on reads made before the field existed. */
    subject: ScanSubjectSchema.optional(),
    /** Optional: absent on reads made before the field existed. */
    legibility: ScanLegibilitySchema.optional(),
    /** Optional: absent on reads made before the field existed. */
    drink: ScanDrinkSchema.optional(),
    name_ja: z.string().min(1),
    /**
     * Whether the photo prints the brewery's name. A front label often
     * shows the brand alone, and the model then fills `brewery_ja` with the
     * brewery it knows makes that brand — so a misread brand arrives with a
     * brewery that "agrees" with it. False says the brewery is no second
     * witness. Asked before the brewery so the model settles it first.
     * Optional: absent on reads made before the field existed.
     */
    brewery_printed: z.boolean().optional(),
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
     *
     * No length limit here on purpose: a model that lists one name too many
     * would fail the whole parse and with it the scan. The resolver uses the
     * first few and ignores the rest.
     */
    other_names: z.array(z.string()).optional(),
    /**
     * `name_ja` and `brewery_ja` once more in Latin letters: the spelling the
     * label prints where it prints one, the model's Hepburn reading where it
     * does not. A visitor who cannot read Japanese has nothing else to go on
     * when the read is not in the catalogue, where the catalogue's own Latin
     * name would otherwise stand. A reading by the model, so it is shown
     * under the Read by AI badge like the rest of the read, and never used by
     * the lookup. Optional: absent on reads made before the fields existed.
     */
    name_romaji: z.string().optional(),
    brewery_romaji: z.string().optional(),
    bottling: ScanBottlingSchema.optional(),
  })
  .extend({
    confidence: z.number().min(0).max(1),
  })

export type LabelScanExtraction = z.infer<typeof LabelScanExtractionSchema>

export const parseLabelScanExtraction = (input: unknown): LabelScanExtraction =>
  LabelScanExtractionSchema.parse(input)
