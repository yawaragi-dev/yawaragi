import { z } from 'zod'

/**
 * What a cellar action acts on (design v1.6.1: "one row per thing a bottle
 * was logged against"): a sake from the catalogue, or one bottling the User
 * added themselves. Exactly one of the two.
 */
export const CellarTargetSchema = z.union([
  z.object({ brandId: z.number().int().positive() }).strict(),
  z.object({ expressionId: z.string().min(1).max(64) }).strict(),
])
export type CellarTarget = z.infer<typeof CellarTargetSchema>
