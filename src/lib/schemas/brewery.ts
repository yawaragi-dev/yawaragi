import { z } from 'zod'
import { WithProvenance } from './with-provenance'

// Two Sakenowa data conventions show up in this shape:
//   - name is empty for ~48 placeholder rows ("specific brewery within
//     prefecture unknown"). Brands FK against them to keep the prefecture
//     link, so we preserve the rows rather than skip them.
//   - areaId can be 0, which Sakenowa uses for foreign producers (Taiwan,
//     Korea, etc.) that don't fit the 47-prefecture scheme.
export const BrewerySchema = WithProvenance.extend({
  breweryId: z.number().int().positive(),
  name: z.string(),
  nameKanji: z.string(),
  areaId: z.number().int().nonnegative(),
})
export type Brewery = z.infer<typeof BrewerySchema>

export const parseBrewery = (input: unknown): Brewery => BrewerySchema.parse(input)

// `true` when the row is one of Sakenowa's placeholder breweries (empty
// name marker). The page suppresses the brewery section in this case;
// future code should branch on this rather than testing `name === ''`
// inline.
export const isPlaceholderBrewery = (brewery: Brewery): boolean => brewery.name === ''
