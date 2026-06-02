import { z } from 'zod'
import { withProvenance } from './with-provenance'

// Area is a Sakenowa-mirrored record with one exception: Sakenowa parks
// foreign producers (Taiwan, Korea, etc.) under areaId 0 because they
// don't fit the 47-prefecture scheme. We keep area 0 as a real row
// (source='manual_curation') so breweries.area_id never points at a
// missing parent — see CONTEXT.md "Flagged ambiguities". That sentinel
// is why Area's source subset includes `manual_curation` even though
// the other Sakenowa-mirrored kinds do not.
export const AreaSource = z.enum([
  'sakenowa',
  'sakenowa_inferred',
  'user_corrected',
  'manual_curation',
])
export type AreaSource = z.infer<typeof AreaSource>

export const AreaSchema = withProvenance(AreaSource).extend({
  areaId: z.number().int().nonnegative(),
  name: z.string().min(1),
})
export type Area = z.infer<typeof AreaSchema>

export const parseArea = (input: unknown): Area => AreaSchema.parse(input)
