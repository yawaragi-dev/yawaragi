import { z } from 'zod'
import {
  ScanDrinkSchema,
  ScanGradeSchema,
  ScanStyleSchema,
} from './label-scan-extraction'
import { withProvenance } from './with-provenance'

/**
 * A ListScanExtraction is what the vision model reads off a photo of a whole
 * drinks list — a menu, or a shelf of bottles — for design v1.7 §7 ("what
 * should I order from this menu, or take from this shelf?"). One label scan
 * answers "which sake is this bottle"; this answers "which drinks are on this
 * list", line by line, in the order they are printed or stand.
 *
 * ADR-0005: like a label read it can only come from a vision model, so
 * `source` is pinned to `'llm_extracted'`.
 *
 * Every field of a line is what the photo prints. Lines with no readable name
 * are not lines here — they are counted in `unreadable_count`, which is all
 * §7 says about them ("3 lines we couldn't read", C11).
 */

/** One drink on the list: a menu line, or one bottle (or its shelf tag). */
export const ListScanLineSchema = z.object({
  /** The line as printed, name part only, verbatim: "秋鹿 奥鹿 純米 山廃". What §7 shows as "what was read". */
  printed: z.string().min(1),
  /**
   * The brand (銘柄) in the script it is printed in, grade and style words
   * stripped — the label scan's `name_ja` rule, so the catalogue lookup is
   * the same one.
   */
  name_ja: z.string().min(1),
  /** `name_ja` in Latin letters: as printed where it is, else Hepburn. */
  name_romaji: z.string().optional(),
  /** Whether the list prints the brewery for this line. Menus rarely do. */
  brewery_printed: z.boolean().optional(),
  /**
   * The brewery: as printed, or — when `brewery_printed` is false — the one
   * the model knows makes this brand, which the lookup treats as no second
   * witness (the label scan's rule).
   */
  brewery_ja: z.string().optional(),
  /** Other names printed for the same drink: the product name, a second script. */
  other_names: z.array(z.string()).optional(),
  /** The product or sub-line name beside the brand, as printed (奥鹿, 甲子, "Wandering Poet"). */
  product_name: z.string().optional(),
  /** `product_name` in Latin letters, by the `name_romaji` rule (奥鹿 → Okuharuka). */
  product_name_romaji: z.string().optional(),
  grade: ScanGradeSchema.optional(),
  styles: z.array(ScanStyleSchema).optional(),
  /** What the line says the drink is. Craft sake is `sake` with `craft: true`. */
  drink: ScanDrinkSchema,
  /** Printed as craft sake (クラフトサケ, "Craft Sake"): §7 lists it with the sakes, marked (C15). */
  craft: z.boolean().optional(),
  /**
   * The glass price as printed, in the list's currency — the smallest serving
   * when several are printed. Never on a shelf, whose tags are not reliable
   * (§7: no price chip there). Absent when none is printed or it is unreadable.
   */
  price: z.number().nonnegative().optional(),
  /** The list offers this one warm (燗, お燗, 熱燗, ぬる燗, a "hot" column). */
  warm: z.boolean().optional(),
  /**
   * The name was read but part of the line was not — the grade or the price
   * is cut off, blurred or behind glare. §7 tags the row "Partly read" (C11).
   */
  partly_read: z.boolean().optional(),
})
export type ListScanLine = z.infer<typeof ListScanLineSchema>

export const ListCurrencySchema = z.enum(['JPY', 'EUR', 'USD', 'GBP', 'CHF', 'other'])
export type ListCurrency = z.infer<typeof ListCurrencySchema>

export const ListScanExtractionSchema = withProvenance(z.literal('llm_extracted')).extend({
  /** A printed list of drinks, or bottles standing side by side (a shelf, a counter, a tasting flight). */
  kind: z.enum(['menu', 'shelf']),
  /** Every drink with a readable name, in list order: top to bottom, or left to right. */
  lines: z.array(ListScanLineSchema),
  /** Lines or bottles whose name could not be read at all — cut off, glare, turned away, too far. */
  unreadable_count: z.number().int().nonnegative(),
  /** The currency the prices are printed in. Absent when no price is printed. */
  currency: ListCurrencySchema.optional(),
})
export type ListScanExtraction = z.infer<typeof ListScanExtractionSchema>
