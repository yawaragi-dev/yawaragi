import { z } from 'zod'
import { GuideSourceSchema } from '@/lib/schemas/guide-entry'
import { SERVING_TEMPERATURES } from '@/lib/schemas/detailed-notes'

/**
 * One row of the hand-curated pairing table behind §9.7 "Goes with" (#336).
 *
 * A row is a kind of sake — one of the Sake Service Institute's types, or a
 * style a bottling names — and the food it is commonly served with, taken
 * from named sources. Foods and reasons are message keys
 * (`pairings.rows.<id>.<food>.{name,reason}`), never free text, so EN and DE
 * say the same thing. Nothing here is a model's suggestion: the table is
 * `manual_curation`; a row reached through a sake's flavor chart is shown as
 * `sakenowa_inferred` by the resolver.
 */
export const PairingRowSchema = z.object({
  id: z.string().regex(/^[a-z][A-Za-z0-9]*$/),
  /** Two or three, in the order shown. Each a key under `pairings.rows.<id>`. */
  foods: z.array(z.string().regex(/^[a-z][A-Za-z0-9]*$/)).min(2).max(3),
  /** How it is usually served, coolest first; shown as a hint, never per dish. */
  serve: z.array(z.enum(SERVING_TEMPERATURES)).min(1).max(2),
  sources: z.array(GuideSourceSchema).min(1),
  source: z.literal('manual_curation'),
  /** `YYYY-MM-DD` the sources were last read. */
  verifiedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
})
export type PairingRow = z.infer<typeof PairingRowSchema>
