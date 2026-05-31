import { z } from 'zod'
import { WithProvenance } from './with-provenance'

// Per-table counts shape. `total` is the only universally-meaningful field
// (it always tracks the source row count); add/update/unchanged apply to
// content-hash-classifying ingestors (brands, breweries, flavor_charts,
// areas, flavor_tags). rankings has only `total` because ADR-0002 forces
// a wholesale replace — there is no per-row classification.
//
// `yearMonth` is populated only by rankings (e.g. "202402") and carries
// the Sakenowa snapshot month the latest replace-all captured. CONTEXT.md
// "Ranking" defines year_month as part of the concept; it lives here on
// per_table so #54's cron route can read it off the latest ingestion_runs
// row to decide "Sakenowa published a fresh snapshot vs. same as last
// run". Optional + present-only-on-rankings so the JSON stays compact for
// the other tables.
export const PerTableCounts = z.object({
  added: z.number().int().nonnegative().optional(),
  updated: z.number().int().nonnegative().optional(),
  unchanged: z.number().int().nonnegative().optional(),
  total: z.number().int().nonnegative(),
  yearMonth: z.string().min(1).optional(),
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
