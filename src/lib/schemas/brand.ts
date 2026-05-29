import { z } from 'zod'
import { WithProvenance } from './with-provenance'

export const BrandSchema = WithProvenance.extend({
  brandId: z.number().int().positive(),
  name: z.string().min(1),
  nameKanji: z.string().min(1),
  breweryId: z.number().int().positive(),
})
export type Brand = z.infer<typeof BrandSchema>

export const parseBrand = (input: unknown): Brand => BrandSchema.parse(input)
