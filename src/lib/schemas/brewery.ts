import { z } from 'zod'
import { WithProvenance } from './with-provenance'

export const BrewerySchema = WithProvenance.extend({
  breweryId: z.number().int().positive(),
  name: z.string().min(1),
  nameKanji: z.string().min(1),
  areaId: z.number().int().positive(),
})
export type Brewery = z.infer<typeof BrewerySchema>

export const parseBrewery = (input: unknown): Brewery => BrewerySchema.parse(input)
