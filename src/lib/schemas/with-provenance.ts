import { z } from 'zod'

// The closed 7-value taxonomy (CONTEXT.md "Provenance taxonomy", ADR-0005).
// Stays a single union for predicates in `src/lib/provenance/policy.ts`
// that must accept any source — narrowing happens per record kind via
// `withProvenance(...)` below, not here.
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

// `WithProvenance` (the wide one, accepting any source) stays exported so
// downstream callers that genuinely operate over the full union — the
// provenance policy predicates, the dev audit page, telemetry views —
// have a single shape to consume. Record-kind schemas should use the
// `withProvenance(...)` factory instead so each kind's `source` field is
// pinned to its legitimate subset (ADR-0005).
export const WithProvenance = z.object({
  source: ProvenanceSource,
  confidence: z.number().min(0).max(1).optional(),
})
export type WithProvenance = z.infer<typeof WithProvenance>

// Factory: returns the `{ source, confidence }` mixin with `source` pinned
// to the supplied narrower schema. Each record-kind module composes its
// shape via `withProvenance(...).extend({ ...fields })` — the per-record
// customization is one line, the invariant lives at the parse-time seam,
// and adding a record kind doesn't require touching this file.
//
// Why a factory rather than reusing the wide `WithProvenance` and trusting
// every caller to override `source`: the wide one already accepts every
// taxonomy value, so a forgotten override silently widens. The factory
// flips the default — callers must positively name the legitimate subset
// for their record kind before composing the rest of the shape. (A caller
// who deliberately `.extend({ source: ... })` to widen again still can —
// Zod's extend overrides on conflict — but that's now an explicit act, not
// a default behaviour.)
export function withProvenance<S extends z.ZodType<ProvenanceSource>>(sourceSchema: S) {
  return z.object({
    source: sourceSchema,
    confidence: z.number().min(0).max(1).optional(),
  })
}
