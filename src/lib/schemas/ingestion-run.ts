import { z } from 'zod'
import { WithProvenance } from './with-provenance'

// Per-table counts shape. `total` is the only universally-meaningful field
// (it always tracks the source row count); add/update/unchanged apply to
// content-hash-classifying ingestors (brands, breweries, flavor_charts,
// areas, flavor_tags). rankings has only `total` because ADR-0002 forces
// a wholesale replace — there is no per-row classification.
export const PerTableCounts = z.object({
  added: z.number().int().nonnegative().optional(),
  updated: z.number().int().nonnegative().optional(),
  unchanged: z.number().int().nonnegative().optional(),
  total: z.number().int().nonnegative(),
})
export type PerTableCounts = z.infer<typeof PerTableCounts>

export const IngestionRunStatus = z.enum(['success', 'failed'])
export type IngestionRunStatus = z.infer<typeof IngestionRunStatus>

// Telemetry, not user-facing — but the project's "every record carries
// provenance" rule still applies. source='manual_curation' because the
// row is hand-stamped by the ingestion script, not derived from Sakenowa
// content.
//
// The `perTable` shape is the contract #54 (cron route) reads. Keys
// mirror the ingestion order; add new ones rather than renaming.
export const IngestionRunSchema = WithProvenance.extend({
  runId: z.string().uuid(),
  startedAt: z.string().datetime({ offset: true }),
  finishedAt: z.string().datetime({ offset: true }),
  status: IngestionRunStatus,
  perTable: z.object({
    brands: PerTableCounts.optional(),
    breweries: PerTableCounts.optional(),
    flavorCharts: PerTableCounts.optional(),
    areas: PerTableCounts.optional(),
    flavorTags: PerTableCounts.optional(),
    rankings: PerTableCounts.optional(),
  }),
  sourceRevisionHash: z.string().min(1),
  errorMessage: z.string().nullable(),
})
export type IngestionRun = z.infer<typeof IngestionRunSchema>

export const parseIngestionRun = (input: unknown): IngestionRun =>
  IngestionRunSchema.parse(input)
