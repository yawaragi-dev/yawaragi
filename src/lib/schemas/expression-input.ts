import { z } from 'zod'
import { CellarBottleSchema } from '@/lib/schemas/cellar-bottle'
import { BottlingDetailsSchema, ExpressionSchema, MAX_EXPRESSION_TEXT } from '@/lib/schemas/expression'
import { JournalEntrySchema } from '@/lib/schemas/journal-entry'

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
  z.object({ brandId: z.number().int().positive(), name: Text, details: BottlingDetailsSchema.optional() }).strict(),
  z
    .object({
      brandId: z.null(),
      name: Text,
      /** Blank counts as not given: the field on §5a is prefilled and editable. */
      brewery: z.string().trim().max(MAX_EXPRESSION_TEXT).optional(),
      /** The name or brewery is still the model's Latin reading (§5a's "Keep
       *  it anyway", design v1.7.1 H3). */
      aiName: z.literal(true).optional(),
      aiBrewery: z.literal(true).optional(),
      details: BottlingDetailsSchema.optional(),
    })
    .strict(),
])
export type AddOwnBottlingInput = z.infer<typeof AddOwnBottlingInputSchema>

/**
 * Input to "Rename" (design v1.6.2 §9a): the bottling, and its name as it
 * should read. `brewery` is only taken for a bottling with no sake — with one,
 * the brewery is the catalogue's. Blank clears it.
 */
export const RenameOwnBottlingInputSchema = z.object({
  expressionId: z.string().min(1).max(64),
  name: Text,
  brewery: z.string().trim().max(MAX_EXPRESSION_TEXT).optional(),
  /** Given, it replaces what is stored: a field left out of it is cleared. */
  details: BottlingDetailsSchema.optional(),
})
export type RenameOwnBottlingInput = z.infer<typeof RenameOwnBottlingInputSchema>

/**
 * What "Undo" sends back after a delete (design v1.6.2: "restores the
 * bottling, its tastings and its cellar rows in one step"): the records as
 * they were, handed to the browser by the delete and returned unchanged.
 *
 * It comes back from the client, so it is checked like any input: every
 * record must parse, and every one must belong to the bottling being restored
 * — its own tastings and cellar rows, or its sake's own rows — so the undo of
 * one delete cannot be used to write anything else.
 */
export const DeletedBottlingSchema = z
  .object({
    expression: ExpressionSchema,
    entries: z.array(JournalEntrySchema).max(2000),
    cellar: z.array(CellarBottleSchema).max(200),
    createdCellarKeys: z.array(z.string().min(1).max(80)).max(200),
  })
  .refine((d) => d.entries.every((e) => e.expression?.id === d.expression.id), {
    message: 'a tasting that is not of this bottling',
    path: ['entries'],
  })
  .refine(
    (d) =>
      d.cellar.every(
        (row) =>
          row.expression?.id === d.expression.id ||
          (row.expression === undefined &&
            d.expression.brandId !== null &&
            row.brandId === d.expression.brandId),
      ),
    { message: 'a cellar row that is neither this bottling\'s nor its sake\'s', path: ['cellar'] },
  )
  .refine((d) => d.createdCellarKeys.length === 0 || d.expression.brandId !== null, {
    message: 'a bottling with no sake creates no rows',
    path: ['createdCellarKeys'],
  })
export type DeletedBottlingInput = z.infer<typeof DeletedBottlingSchema>
