import { CROSS_BEVERAGE_MAP } from '@/lib/ai/tools/cross-beverage-data'
import type { CrossBeverageMap } from '@/lib/schemas/cross-beverage-map'

/**
 * §12's "Start from a drink you know" chips — named bottles, not descriptors.
 *
 * The design lists five by name: Lagavulin 16 · Riesling Spätlese · Guinness ·
 * Fino sherry · Pinot Noir. That is the right vocabulary and the existing
 * surface had the wrong one: `/profile`'s seed form offered the cross-beverage
 * table's *descriptors* ("peated", "off-dry", "roasty"), which are the names
 * the curation uses internally. A visitor knows what Guinness is; "roasty" is
 * our word for it.
 *
 * The names are not re-typed here as copy. Every cross-beverage row already
 * carries `exemplars` — the specific bottles the research distilled the row
 * from (#164, `manual_curation`) — so a chip is one of those exemplars plus
 * the descriptor whose row names it. The seed a chip produces is therefore
 * exactly the seed the descriptor produces; the chip only changes which word
 * the visitor reads.
 *
 * Exemplar names stay verbatim across locales: "Riesling Spätlese" is a style
 * name, not translatable copy (see `ExemplarSchema`).
 */

export type Beverage = CrossBeverageMap['beverage']

export interface ColdStartChip {
  /** The bottle or style the visitor recognises. Locale-invariant. */
  readonly name: string
  /** Short style pointer for anyone who does not recognise the name. */
  readonly region?: string
  /** Canonical cross-beverage descriptor this chip seeds from. */
  readonly descriptor: string
  readonly beverage: Beverage
}

/**
 * The five the design names, in its order.
 *
 * Written as exemplar names rather than descriptors so this list reads like
 * the design does, and so a rename in the curation data breaks a test instead
 * of silently dropping a chip — see `cold-start-chips.test.ts`.
 *
 * "Burgundy Pinot Noir" is the data's name for the design's "Pinot Noir"; the
 * research row is anchored on village Burgundy specifically, and the exemplar
 * is the one place that precision lives.
 */
const DESIGN_CHIP_NAMES: readonly string[] = [
  'Lagavulin 16',
  'Riesling Spätlese',
  'Guinness',
  'Fino Sherry',
  'Burgundy Pinot Noir',
]

/**
 * Resolve each named bottle to the row that names it.
 *
 * First match wins. Two rows can list the same exemplar (Lagavulin 16 anchors
 * both `peated` and `smoky`), and the table's own order is the curation's
 * preference — `peated` is the anchored row, `smoky` the broader average.
 */
export function coldStartChips(names: readonly string[] = DESIGN_CHIP_NAMES): ColdStartChip[] {
  const chips: ColdStartChip[] = []
  for (const name of names) {
    const row = CROSS_BEVERAGE_MAP.find((candidate) =>
      candidate.exemplars.some((exemplar) => exemplar.name === name),
    )
    if (!row) continue
    const exemplar = row.exemplars.find((candidate) => candidate.name === name)
    chips.push({
      name,
      region: exemplar?.region,
      descriptor: row.descriptor,
      beverage: row.beverage,
    })
  }
  return chips
}

/** The names the design asks for, for the test that proves each one resolves. */
export const COLD_START_CHIP_NAMES = DESIGN_CHIP_NAMES
