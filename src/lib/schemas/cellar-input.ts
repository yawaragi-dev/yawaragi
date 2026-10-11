import { z } from 'zod'
import { MAX_CELLAR_COUNT } from '@/lib/schemas/cellar-bottle'

/**
 * What "Add to cellar" adds a bottle of (design v1.6.1: "one row per thing a
 * bottle was logged against"): a sake from the catalogue, or one bottling the
 * User added themselves. Exactly one of the two.
 */
export const CellarTargetSchema = z.union([
  z.object({ brandId: z.number().int().positive() }).strict(),
  z.object({ expressionId: z.string().min(1).max(64) }).strict(),
])
export type CellarTarget = z.infer<typeof CellarTargetSchema>

/**
 * What the "Add to cellar" sheet sets (design v1.6.2, decision 2): how many
 * bottles, their size, and whether they are nama. The same three when the
 * sheet edits a row.
 */
export const CellarSheetValuesSchema = z
  .object({
    count: z.number().int().min(1).max(MAX_CELLAR_COUNT),
    sizeMl: z.union([z.literal(180), z.literal(300), z.literal(720), z.literal(1800)]),
    nama: z.boolean(),
  })
  .strict()
export type CellarSheetValues = z.infer<typeof CellarSheetValuesSchema>

/** A cellar row's key, as `cellarRowKey` builds it. */
export const CellarRowKeySchema = z.string().min(1).max(120)
