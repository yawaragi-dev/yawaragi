import { z } from 'zod'
import { withProvenance } from './with-provenance'

// FlavorTag is Sakenowa's 117-tag categorical vocabulary (sweet, umami,
// fruity, dry, etc.) attached to brands. Issue #52 refers to this as
// "Types" / "sake categories", but Sakenowa publishes it at /flavor-tags
// and CONTEXT.md fixes the domain name as FlavorTag — so we follow the
// project's domain language rather than the issue's working title.
//
// ADR-0005: FlavorTag rows are Sakenowa-mirrored. The "subjective" feel
// of these tags doesn't make them LLM-extracted — the vocabulary itself
// is canonical, attached upstream.
export const FlavorTagSource = z.enum([
  'sakenowa',
  'sakenowa_inferred',
  'user_corrected',
])
export type FlavorTagSource = z.infer<typeof FlavorTagSource>

export const FlavorTagSchema = withProvenance(FlavorTagSource).extend({
  tagId: z.number().int().positive(),
  name: z.string().min(1),
})
export type FlavorTag = z.infer<typeof FlavorTagSchema>

export const parseFlavorTag = (input: unknown): FlavorTag => FlavorTagSchema.parse(input)
