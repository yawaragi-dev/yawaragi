import { z } from 'zod'
import { withProvenance } from './with-provenance'

// Brewery is a Sakenowa-mirrored record. Two Sakenowa data conventions
// show up in this shape:
//   - name is empty for ~48 placeholder rows ("specific brewery within
//     prefecture unknown"). Brands FK against them to keep the prefecture
//     link, so we preserve the rows rather than skip them.
//   - areaId can be 0, which Sakenowa uses for foreign producers (Taiwan,
//     Korea, etc.) that don't fit the 47-prefecture scheme.
//
// ADR-0005 binds source to record kind: a Brewery row only ever
// originates from Sakenowa (raw or derived) or a user override. The
// placeholder rows are still Sakenowa-sourced — their `name` is empty
// upstream — so they do NOT need `manual_curation`.
export const BrewerySource = z.enum(['sakenowa', 'sakenowa_inferred', 'user_corrected'])
export type BrewerySource = z.infer<typeof BrewerySource>

export const BrewerySchema = withProvenance(BrewerySource).extend({
  breweryId: z.number().int().positive(),
  name: z.string(),
  nameKanji: z.string(),
  /**
   * Latin-alphabet transliteration of `nameKanji`. NULL until the
   * romaji-ingest pipeline (issue #121) has run, AND remains NULL
   * for placeholder rows (`isPlaceholderBrewery`) since there's no
   * kanji to transliterate. Editorial / LLM-derived per CONTEXT.md
   * "Naming convention".
   *
   * Display-only. The strip-`株式会社`-style legal suffixes rule
   * lives in the transliteration prompt; the stored value is the
   * already-stripped display form ("旭酒造株式会社" → "Asahi Shuzo").
   *
   * `default(null)` so callers building a Brewery from scratch don't
   * have to include the field — see the same comment in brand.ts.
   */
  nameRomaji: z.string().min(1).nullable().default(null),
  areaId: z.number().int().nonnegative(),
})
export type Brewery = z.infer<typeof BrewerySchema>

export const parseBrewery = (input: unknown): Brewery => BrewerySchema.parse(input)

/**
 * `true` when the row is one of Sakenowa's placeholder breweries: 48 rows,
 * one per prefecture (ids 784–830) and one for "other" (1147), that stand
 * for "maker not on record" (#419). They carry an area and no name at all —
 * `name`, `name_kanji` and `name_romaji` are all empty — so the empty kanji
 * name is the marker. A placeholder is not a brewery: never show it as one,
 * never count it as one, and never let it agree with a brewery read on a
 * label. Branch on this rather than testing `name === ''` inline.
 */
export const isPlaceholderBrewery = (brewery: { readonly nameKanji: string }): boolean =>
  brewery.nameKanji.trim() === ''

/**
 * A list row's brewery names as the row may show them: both `null` where the
 * catalogue has no brewery for the sake (a LEFT JOIN that found none) or only
 * a placeholder. Every row that renders "brewery · prefecture" then shows the
 * prefecture alone, and nothing reads an empty name as a brewery.
 */
export function shownBreweryNames(
  kanji: string | null,
  romaji: string | null,
): { breweryKanji: string | null; breweryRomaji: string | null } {
  return kanji === null || isPlaceholderBrewery({ nameKanji: kanji })
    ? { breweryKanji: null, breweryRomaji: null }
    : { breweryKanji: kanji, breweryRomaji: romaji }
}
