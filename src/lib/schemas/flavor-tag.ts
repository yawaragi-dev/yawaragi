import { z } from 'zod'
import { WithProvenance } from './with-provenance'

// FlavorTag is Sakenowa's 117-tag categorical vocabulary (sweet, umami,
// fruity, dry, etc.) attached to brands. Issue #52 refers to this as
// "Types" / "sake categories", but Sakenowa publishes it at /flavor-tags
// and CONTEXT.md fixes the domain name as FlavorTag — so we follow the
// project's domain language rather than the issue's working title.
export const FlavorTagSchema = WithProvenance.extend({
  tagId: z.number().int().positive(),
  name: z.string().min(1),
})
export type FlavorTag = z.infer<typeof FlavorTagSchema>

export const parseFlavorTag = (input: unknown): FlavorTag => FlavorTagSchema.parse(input)
