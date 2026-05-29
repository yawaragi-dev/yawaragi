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
  endpoint: '/brands' | '/breweries',
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
