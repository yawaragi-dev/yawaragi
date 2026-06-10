import { z } from 'zod'
import { withProvenance } from './with-provenance'

// Brand is a Sakenowa-mirrored record. ADR-0005 binds `source` to the
// kind: a brand row only ever originates from Sakenowa (raw or derived)
// or from a user override. `llm_extracted`, `llm_inferred`,
// `cross_beverage_map`, and `manual_curation` are all semantic mismatches
// here — pinning the source at parse time is the seam that catches them.
export const BrandSource = z.enum(['sakenowa', 'sakenowa_inferred', 'user_corrected'])
export type BrandSource = z.infer<typeof BrandSource>

export const BrandSchema = withProvenance(BrandSource).extend({
  brandId: z.number().int().positive(),
  name: z.string().min(1),
  nameKanji: z.string().min(1),
  /**
   * Latin-alphabet transliteration of `nameKanji`. NULL until the
   * romaji-ingest pipeline (issue #121) has run against this row.
   * Editorial / LLM-derived per CONTEXT.md "Naming convention" —
   * not a Sakenowa-published field.
   *
   * Display-only. Joins still go through `nameKanji` because two
   * distinct kanji rows can transliterate to the same romaji
   * (CONTEXT.md § "Same-romaji collisions").
   *
   * `default(null)` so callers building a Brand from scratch don't
   * have to include the field — the field is omitted in older
   * fixtures and inferred to null. Already-parsed values still have
   * the `string | null` type.
   */
  nameRomaji: z.string().min(1).nullable().default(null),
  breweryId: z.number().int().positive(),
})
export type Brand = z.infer<typeof BrandSchema>

export const parseBrand = (input: unknown): Brand => BrandSchema.parse(input)
