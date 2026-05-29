import { z } from 'zod'
import { summarizeZodError } from '../schemas/zod-error-summary'

const SAKENOWA_BASE_URL = 'https://muro.sakenowa.com/sakenowa-data/api'

export const SakenowaBrand = z.object({
  id: z.number().int().positive(),
  name: z.string().min(1),
  breweryId: z.number().int().positive(),
})
export type SakenowaBrand = z.infer<typeof SakenowaBrand>

// Envelope schemas require the top-level array key — that's how we detect
// real drift (Sakenowa renaming `brands` → `items`, dropping the envelope,
// etc.). Inner rows are unknown at envelope time so a single malformed
// row doesn't blow up the whole response; per-row filtering happens after.
const BrandsResponse = z.object({
  brands: z.array(z.unknown()),
})

// See note in src/lib/schemas/brewery.ts: empty name is a placeholder
// sentinel; areaId 0 means foreign producer. Both are valid Sakenowa
// shapes — only truly malformed rows (wrong types, missing fields) are
// dropped by the row filter downstream.
export const SakenowaBrewery = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  areaId: z.number().int().nonnegative(),
})
export type SakenowaBrewery = z.infer<typeof SakenowaBrewery>

const BreweriesResponse = z.object({
  breweries: z.array(z.unknown()),
})

// Sakenowa publishes flavor charts as a per-brand 6-tuple; each axis is a
// float in [0, 1]. See src/lib/schemas/flavor-chart.ts for the storage
// shape. Schema-shape drift (e.g. an `f7` axis arriving) throws — the
// pipeline never silently writes partial data on a new envelope.
const Axis = z.number().min(0).max(1)
export const SakenowaFlavorChart = z.object({
  brandId: z.number().int().positive(),
  f1: Axis,
  f2: Axis,
  f3: Axis,
  f4: Axis,
  f5: Axis,
  f6: Axis,
})
export type SakenowaFlavorChart = z.infer<typeof SakenowaFlavorChart>

const FlavorChartsResponse = z.object({
  flavorCharts: z.array(z.unknown()),
})

// Sakenowa areas — one row per Japanese prefecture, plus a sentinel id 0
// row (Sakenowa: "その他" / Other) used for foreign producers.
export const SakenowaArea = z.object({
  id: z.number().int().nonnegative(),
  name: z.string().min(1),
})
export type SakenowaArea = z.infer<typeof SakenowaArea>

const AreasResponse = z.object({
  areas: z.array(z.unknown()),
})

// Sakenowa flavor tags — the 117-tag categorical vocabulary the issue
// refers to as "Types". Sakenowa's row key is `tag` (the label),
// distinct from `name` on /areas, /breweries, /brands.
export const SakenowaFlavorTag = z.object({
  id: z.number().int().positive(),
  tag: z.string().min(1),
})
export type SakenowaFlavorTag = z.infer<typeof SakenowaFlavorTag>

const FlavorTagsResponse = z.object({
  tags: z.array(z.unknown()),
})

// Sakenowa publishes a single /rankings endpoint that carries both
// scopes — `overall` (a flat top list) and `areas` (per-prefecture
// lists keyed by areaId). yearMonth is the snapshot month (e.g.
// "202402"); ADR-0002 keeps only the latest, so we don't persist it
// per-row, but we surface it from the client for the source-revision
// hash and operator visibility.
export const SakenowaRankingEntry = z.object({
  rank: z.number().int().positive(),
  brandId: z.number().int().positive(),
  score: z.number(),
})
export type SakenowaRankingEntry = z.infer<typeof SakenowaRankingEntry>

const RankingsResponse = z.object({
  yearMonth: z.string().min(1),
  overall: z.array(z.unknown()),
  areas: z.array(z.unknown()),
})

const SakenowaAreaRanking = z.object({
  areaId: z.number().int().nonnegative(),
  ranking: z.array(SakenowaRankingEntry),
})
export type SakenowaAreaRanking = z.infer<typeof SakenowaAreaRanking>

export interface SakenowaRankingsPayload {
  yearMonth: string
  overall: SakenowaRankingEntry[]
  areas: SakenowaAreaRanking[]
}


export class SakenowaError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'SakenowaError'
  }
}

export interface SkippedRowsReporter {
  (info: { endpoint: string; skipped: number; total: number; summary: string }): void
}

// Defaults to a stderr line so non-test callers (the CLI script) see them.
// Tests can pass a no-op or capture to a buffer.
const defaultSkippedReporter: SkippedRowsReporter = ({ endpoint, skipped, total, summary }) => {
  process.stderr.write(
    `! Sakenowa ${endpoint}: skipped ${skipped} of ${total} malformed row(s) — ${summary}\n`,
  )
}

async function fetchAndParseEnvelope<T>(
  endpoint:
    | '/brands'
    | '/breweries'
    | '/flavor-charts'
    | '/areas'
    | '/flavor-tags'
    | '/rankings',
  envelope: z.ZodType<T>,
): Promise<T> {
  const url = `${SAKENOWA_BASE_URL}${endpoint}`

  let response: Response
  try {
    response = await fetch(url)
  } catch (cause) {
    throw new SakenowaError(`Network error fetching ${url}`, cause)
  }

  if (!response.ok) {
    throw new SakenowaError(
      `Sakenowa ${endpoint} returned ${response.status} ${response.statusText}`,
    )
  }

  let body: unknown
  try {
    body = await response.json()
  } catch (cause) {
    throw new SakenowaError(`Sakenowa ${endpoint} returned non-JSON body`, cause)
  }

  const parsed = envelope.safeParse(body)
  if (!parsed.success) {
    throw new SakenowaError(
      `Sakenowa ${endpoint} response envelope failed schema validation: ${summarizeZodError(parsed.error)}`,
      parsed.error,
    )
  }
  return parsed.data
}

// Filter each row through the row schema; collect issues so we can report
// what we dropped (path/code only, never values). Issue accumulation is
// capped at 50 — enough for "5 of 80 rows" diagnosis without unbounded
// memory on a deeply drifted response.
function filterRowsBySchema<T>(
  rows: unknown[],
  rowSchema: z.ZodType<T>,
): { valid: T[]; invalid: number; summary: string } {
  const valid: T[] = []
  let invalid = 0
  const collected: z.core.$ZodIssue[] = []
  const CAP = 50

  for (let i = 0; i < rows.length; i++) {
    const result = rowSchema.safeParse(rows[i])
    if (result.success) {
      valid.push(result.data)
      continue
    }
    invalid++
    if (collected.length < CAP) {
      for (const issue of result.error.issues) {
        // Prepend the row index so paths read like "0.name", "12.areaId".
        collected.push({ ...issue, path: [i, ...issue.path] })
      }
    }
  }

  const summary =
    invalid === 0
      ? 'no issues'
      : summarizeZodError({ issues: collected } as z.ZodError, { sampleSize: 5 })
  return { valid, invalid, summary }
}

export async function getBrands(
  opts: { onSkippedRows?: SkippedRowsReporter } = {},
): Promise<SakenowaBrand[]> {
  const data = await fetchAndParseEnvelope('/brands', BrandsResponse)
  const { valid, invalid, summary } = filterRowsBySchema(data.brands, SakenowaBrand)
  if (invalid > 0) {
    ;(opts.onSkippedRows ?? defaultSkippedReporter)({
      endpoint: '/brands',
      skipped: invalid,
      total: data.brands.length,
      summary,
    })
  }
  return valid
}

export async function getBreweries(
  opts: { onSkippedRows?: SkippedRowsReporter } = {},
): Promise<SakenowaBrewery[]> {
  const data = await fetchAndParseEnvelope('/breweries', BreweriesResponse)
  const { valid, invalid, summary } = filterRowsBySchema(data.breweries, SakenowaBrewery)
  if (invalid > 0) {
    ;(opts.onSkippedRows ?? defaultSkippedReporter)({
      endpoint: '/breweries',
      skipped: invalid,
      total: data.breweries.length,
      summary,
    })
  }
  return valid
}

export async function getFlavorCharts(
  opts: { onSkippedRows?: SkippedRowsReporter } = {},
): Promise<SakenowaFlavorChart[]> {
  const data = await fetchAndParseEnvelope('/flavor-charts', FlavorChartsResponse)
  const { valid, invalid, summary } = filterRowsBySchema(data.flavorCharts, SakenowaFlavorChart)
  if (invalid > 0) {
    ;(opts.onSkippedRows ?? defaultSkippedReporter)({
      endpoint: '/flavor-charts',
      skipped: invalid,
      total: data.flavorCharts.length,
      summary,
    })
  }
  return valid
}

export async function getAreas(
  opts: { onSkippedRows?: SkippedRowsReporter } = {},
): Promise<SakenowaArea[]> {
  const data = await fetchAndParseEnvelope('/areas', AreasResponse)
  const { valid, invalid, summary } = filterRowsBySchema(data.areas, SakenowaArea)
  if (invalid > 0) {
    ;(opts.onSkippedRows ?? defaultSkippedReporter)({
      endpoint: '/areas',
      skipped: invalid,
      total: data.areas.length,
      summary,
    })
  }
  return valid
}

export async function getFlavorTags(
  opts: { onSkippedRows?: SkippedRowsReporter } = {},
): Promise<SakenowaFlavorTag[]> {
  const data = await fetchAndParseEnvelope('/flavor-tags', FlavorTagsResponse)
  const { valid, invalid, summary } = filterRowsBySchema(data.tags, SakenowaFlavorTag)
  if (invalid > 0) {
    ;(opts.onSkippedRows ?? defaultSkippedReporter)({
      endpoint: '/flavor-tags',
      skipped: invalid,
      total: data.tags.length,
      summary,
    })
  }
  return valid
}

// /rankings is a single envelope with two scopes. Both are strict-parsed
// at the row level: a malformed top-list entry or area-list entry is
// filtered out and reported. The envelope shape itself (yearMonth +
// overall + areas keys) must match exactly — schema-shape drift throws.
export async function getRankings(
  opts: { onSkippedRows?: SkippedRowsReporter } = {},
): Promise<SakenowaRankingsPayload> {
  const data = await fetchAndParseEnvelope('/rankings', RankingsResponse)
  const reporter = opts.onSkippedRows ?? defaultSkippedReporter

  const overall = filterRowsBySchema(data.overall, SakenowaRankingEntry)
  if (overall.invalid > 0) {
    reporter({
      endpoint: '/rankings',
      skipped: overall.invalid,
      total: data.overall.length,
      summary: `overall: ${overall.summary}`,
    })
  }

  const areas = filterRowsBySchema(data.areas, SakenowaAreaRanking)
  if (areas.invalid > 0) {
    reporter({
      endpoint: '/rankings',
      skipped: areas.invalid,
      total: data.areas.length,
      summary: `areas: ${areas.summary}`,
    })
  }

  return {
    yearMonth: data.yearMonth,
    overall: overall.valid,
    areas: areas.valid,
  }
}
