import { z } from 'zod'
import { withProvenance } from './with-provenance'

// One Sakenowa flavor tag on one brand: the tags Sakenowa drinkers used for a
// sake (/brand-flavor-tags). Search lists the sakes tagged with a flavor word
// (design v1.8 M3, #451). Sakenowa-mirrored, like FlavorTag (ADR-0005).
//
// `position` is the tag's 1-based place in Sakenowa's `tagIds` array. The
// docs do not say what the order means, so it is kept, not used to rank:
// search lists tagged sakes A–Z (design v1.8 M4).
export const BrandFlavorTagSource = z.enum(['sakenowa'])
export type BrandFlavorTagSource = z.infer<typeof BrandFlavorTagSource>

export const BrandFlavorTagSchema = withProvenance(BrandFlavorTagSource).extend({
  brandId: z.number().int().positive(),
  tagId: z.number().int().positive(),
  position: z.number().int().positive(),
})
export type BrandFlavorTag = z.infer<typeof BrandFlavorTagSchema>
