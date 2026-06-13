/**
 * Maintainer + automation seam for adding brands to the manual-
 * curation layer (ADR-0014). Most likely uses:
 *
 *   - One-off bottles the Sakenowa Data API doesn't yet cover
 *     (collaborations, limited editions — UMAMI is case zero).
 *   - Later: programmatic gap-fill from officially-published
 *     supplementary data sources (NTA brewery maps + brand
 *     registrations, Wikidata, future Sakepedia ingest, etc).
 *
 * Usage (one-off via CLI):
 *
 *   pnpm add-manual-brand --name-kanji "UMAMI" \
 *                         --name "UMAMI" \
 *                         --brewery-id 692 \
 *                         --name-romaji "Umami"
 *
 * Usage (programmatic, from another script):
 *
 *   import { addManualBrand } from './scripts/add-manual-brand'
 *   await addManualBrand({
 *     nameKanji: 'UMAMI',
 *     name: 'UMAMI',
 *     breweryId: 692,
 *     nameRomaji: 'Umami',
 *   })
 *
 * ID picking: the script claims the next available `brand_id` at or
 * above 9_000_000 (the manual-row reserved range — Sakenowa lives
 * in 0..1_000_000). This is the namespace partition the migration
 * enforces at the schema level.
 *
 * Idempotency: the script REJECTS inserts where
 * `(name_kanji, brewery_id)` already matches a live row (any source)
 * — the operator should reconcile manually rather than create a
 * duplicate. Re-running with the same input is a no-op + warning.
 *
 * Source provenance: every row written carries
 * `source = 'manual_curation'`. Per ADR-0005 this never shows a
 * `<ProvenanceBadge />`; the source surfaces in the page's
 * attribution-set logic (ADR-0014) and in audit queries.
 */
import { Pool } from 'pg'

const MANUAL_ID_FLOOR = 9_000_000

export interface ManualBrandInput {
  /** Japanese-script (or Latin) brand name as it appears on the bottle. */
  nameKanji: string
  /** Romaji / canonical Latin form (the Sakenowa `name` column equivalent). */
  name: string
  /** Sakenowa brewery_id this brand belongs to. */
  breweryId: number
  /** Optional cleaner romaji (defaults to `name`). */
  nameRomaji?: string | null
  /** Optional manual-curation confidence (defaults to 1.0). */
  confidence?: number | null
}

export interface AddManualBrandResult {
  kind: 'inserted' | 'already_present'
  brandId: number
  existingSource: string | null
}

/**
 * Inserts a manual_curation brand row. If a live row with the same
 * `(name_kanji, brewery_id)` already exists from any source, returns
 * `already_present` and leaves both rows alone — the operator
 * decides whether to keep the Sakenowa row, mark it superseded, or
 * delete the manual override.
 *
 * Wraps the SELECT-then-INSERT in a serializable transaction so two
 * concurrent invocations can't both claim the same ID.
 */
export async function addManualBrand(
  input: ManualBrandInput,
  pool: Pool,
): Promise<AddManualBrandResult> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE')

    const collision = await client.query<{ brand_id: number; source: string }>(
      `SELECT brand_id, source FROM brands
       WHERE name_kanji = $1 AND brewery_id = $2 AND superseded_at IS NULL`,
      [input.nameKanji, input.breweryId],
    )
    if (collision.rows.length > 0) {
      const existing = collision.rows[0]
      await client.query('ROLLBACK')
      return {
        kind: 'already_present',
        brandId: existing.brand_id,
        existingSource: existing.source,
      }
    }

    const breweryCheck = await client.query<{ brewery_id: number; name_kanji: string }>(
      `SELECT brewery_id, name_kanji FROM breweries
       WHERE brewery_id = $1 AND superseded_at IS NULL`,
      [input.breweryId],
    )
    if (breweryCheck.rows.length === 0) {
      await client.query('ROLLBACK')
      throw new Error(
        `brewery_id ${input.breweryId} does not exist (or is superseded). ` +
          `Pick a real brewery_id, or add the brewery first via add-manual-brewery.`,
      )
    }

    // Pick the next free ID at or above the manual-namespace floor.
    // `COALESCE` makes the first manual row land exactly at the floor.
    const idRow = await client.query<{ next_id: number }>(
      `SELECT GREATEST(
         COALESCE(MAX(brand_id) + 1, 0),
         $1::bigint
       )::int AS next_id
       FROM brands
       WHERE source = 'manual_curation'`,
      [MANUAL_ID_FLOOR],
    )
    const brandId = idRow.rows[0].next_id

    // content_hash is required by the existing schema. For manual
    // rows we synthesise a deterministic value from (name_kanji,
    // brewery_id) so an idempotent re-run yields the same hash.
    const contentHash = `manual:${input.nameKanji}:${input.breweryId}`

    await client.query(
      `INSERT INTO brands
         (brand_id, name, name_kanji, name_romaji, brewery_id, source, confidence, content_hash)
       VALUES ($1, $2, $3, $4, $5, 'manual_curation', $6, $7)`,
      [
        brandId,
        input.name,
        input.nameKanji,
        input.nameRomaji ?? input.name,
        input.breweryId,
        input.confidence ?? 1.0,
        contentHash,
      ],
    )

    await client.query('COMMIT')
    return { kind: 'inserted', brandId, existingSource: null }
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

// ---------------------------------------------------------------------
// CLI entry — only runs when invoked directly via `pnpm tsx`.
// ---------------------------------------------------------------------

function parseArgs(argv: ReadonlyArray<string>): ManualBrandInput {
  const args = new Map<string, string>()
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (!arg.startsWith('--')) continue
    const key = arg.slice(2)
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`Missing value for --${key}`)
    }
    args.set(key, value)
    i++
  }
  const need = (k: string): string => {
    const v = args.get(k)
    if (v === undefined) throw new Error(`Missing --${k}`)
    return v
  }
  return {
    nameKanji: need('name-kanji'),
    name: need('name'),
    breweryId: Number(need('brewery-id')),
    nameRomaji: args.get('name-romaji'),
  }
}

async function main(): Promise<number> {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    console.error('Missing DATABASE_URL. Add it to .env.local and rerun.')
    return 1
  }

  const input = parseArgs(process.argv.slice(2))
  const pool = new Pool({ connectionString })
  try {
    const result = await addManualBrand(input, pool)
    if (result.kind === 'inserted') {
      console.log(
        `✓ Inserted manual brand ${result.brandId} — ` +
          `${input.nameKanji} (brewery_id ${input.breweryId}). ` +
          `source=manual_curation. ` +
          `Visit /sake/${result.brandId} once the next deploy lands.`,
      )
      return 0
    }
    console.log(
      `→ Skipped: a live brand row already covers ` +
        `(name_kanji=${input.nameKanji}, brewery_id=${input.breweryId}). ` +
        `Existing brand_id=${result.brandId} source=${result.existingSource}.`,
    )
    return 0
  } finally {
    await pool.end()
  }
}

// Run as CLI only when invoked directly — `import { addManualBrand }`
// callers from a programmatic script don't trigger this branch.
const isCli =
  typeof require !== 'undefined' && require.main === module ||
  // tsx executes the file as the main module; the heuristic above
  // doesn't apply, so fall back to argv[1] containing this script's path.
  process.argv[1]?.endsWith('add-manual-brand.ts')

if (isCli) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error('[add-manual-brand] failed:', err instanceof Error ? err.message : err)
      process.exit(2)
    })
}
