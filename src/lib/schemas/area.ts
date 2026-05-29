import { z } from 'zod'
import { WithProvenance } from './with-provenance'

// Sakenowa parks foreign producers (Taiwan, Korea, etc.) under areaId 0
// because they don't fit the 47-prefecture scheme. We keep area 0 as a
// real row (manual_curation) so breweries.area_id never points at a
// missing parent — see CONTEXT.md "Flagged ambiguities".
export const AreaSchema = WithProvenance.extend({
  areaId: z.number().int().nonnegative(),
  name: z.string().min(1),
})
export type Area = z.infer<typeof AreaSchema>

export const parseArea = (input: unknown): Area => AreaSchema.parse(input)
