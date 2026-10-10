import { z } from 'zod'
import { MAX_EXPRESSION_TEXT } from '@/lib/schemas/expression'

const Text = z.string().trim().min(1).max(MAX_EXPRESSION_TEXT)

/**
 * Input to adding a bottling of your own (design v1.6, ADR-0025). The server
 * supplies the id, the clock and — with a sake — the line's name. "Just the
 * name — the rest can wait."
 *
 * Two shapes, told apart by `brandId`:
 * - a number: a bottling of a sake the catalogue has ("Add your bottling",
 *   §9). Its brewery is the catalogue's, so none is taken.
 * - `null`: a bottling whose sake the catalogue lacks ("Keep it anyway", §5a;
 *   "Add it yourself", §8). The brewery as read or typed is optional.
 */
export const AddOwnBottlingInputSchema = z.union([
  z.object({ brandId: z.number().int().positive(), name: Text }).strict(),
  z
    .object({
      brandId: z.null(),
      name: Text,
      /** Blank counts as not given: the field on §5a is prefilled and editable. */
      brewery: z.string().trim().max(MAX_EXPRESSION_TEXT).optional(),
    })
    .strict(),
])
export type AddOwnBottlingInput = z.infer<typeof AddOwnBottlingInputSchema>
