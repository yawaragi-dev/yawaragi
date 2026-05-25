import { z } from 'zod'

export const ProvenanceSource = z.enum([
  'sakenowa',
  'sakenowa_inferred',
  'llm_extracted',
  'llm_inferred',
  'cross_beverage_map',
  'user_corrected',
  'manual_curation',
])
export type ProvenanceSource = z.infer<typeof ProvenanceSource>

export const WithProvenance = z.object({
  source: ProvenanceSource,
  confidence: z.number().min(0).max(1).optional(),
})
export type WithProvenance = z.infer<typeof WithProvenance>
