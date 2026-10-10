import { z } from 'zod'
import { MAX_EXPRESSION_TEXT } from '@/lib/schemas/expression'

/**
 * Input to "Add your bottling" (design v1.6 §9, §5): a name, under a sake the
 * catalogue has. The server supplies the id, the clock and the line's name.
 * "Just the name — the rest can wait."
 */
export const AddOwnBottlingInputSchema = z.object({
  brandId: z.number().int().positive(),
  name: z.string().trim().min(1).max(MAX_EXPRESSION_TEXT),
})
export type AddOwnBottlingInput = z.infer<typeof AddOwnBottlingInputSchema>
