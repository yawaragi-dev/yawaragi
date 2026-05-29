/**
 * Sakenowa → Postgres ingestion. Idempotent: a second run on unchanged
 * source data writes zero rows. Failure-aborts: any throw inside the
 * transaction rolls back the entire run (no partial writes).
 *
 * The pipeline is theme-agnostic about its dependencies — it takes a
 * Sakenowa-shaped client and a typed DB contract, both of which can be
 * faked in tests. Production wires `getBrands` / `getBreweries` from
 * `./client` and `makePg{Brands,Breweries}DB(pool)` from `./db`.
 *
 * Brands reference breweries via FK (see 0002_breweries.sql); the script
 * ingests breweries first.
 *
 * Performance: classification happens in-memory (cheap); writes go out
 * as a single bulk `INSERT ... VALUES (...), (...) ON CONFLICT` chunked
 * by the DB layer. Idempotent re-runs do zero writes — the existing
 * content-hash check still gates per row. On Sakenowa-cloud → Supabase-
 * cloud first-time ingest, this collapses ~5000 round trips into ~10.
 */
import { createHash } from 'node:crypto'
import type { SakenowaBrand, SakenowaBrewery } from './client'
import type { BrandsDB, BrandUpsert, BreweriesDB, BreweryUpsert } from './db'
import type { Brand } from '../schemas/brand'
import type { Brewery } from '../schemas/brewery'

export interface RunSummary {
  added: number
  updated: number
  unchanged: number
  total: number
}

export type ProgressCallback = (current: number, total: number) => void

export interface IngestionDeps {
  client: { getBrands: () => Promise<SakenowaBrand[]> }
  db: BrandsDB
  /**
   * Optional. Called after each row is classified. `current` is
   * 1-indexed; `current === total` on the final call. Per-row writes
   * are batched at the end of classification, so progress here tracks
   * the classification loop, not individual DB writes.
   */
  onProgress?: ProgressCallback
}

export interface BreweryIngestionDeps {
  client: { getBreweries: () => Promise<SakenowaBrewery[]> }
  db: BreweriesDB
  onProgress?: ProgressCallback
}

export function sakenowaBrandToBrand(s: SakenowaBrand): Brand {
  return {
    brandId: s.id,
    // Sakenowa returns one Japanese name (typically kanji) — populate both
    // `name` and `nameKanji` with it until a romaji transliteration step
    // arrives in a later slice / Phase 5+.
    name: s.name,
    nameKanji: s.name,
    breweryId: s.breweryId,
    source: 'sakenowa',
  }
}

export function computeContentHash(brand: Brand): string {
  const canonical = JSON.stringify({
    brandId: brand.brandId,
    name: brand.name,
    nameKanji: brand.nameKanji,
    breweryId: brand.breweryId,
    source: brand.source,
    confidence: brand.confidence ?? null,
  })
  return createHash('sha256').update(canonical).digest('hex')
}

export async function ingestBrands(deps: IngestionDeps): Promise<RunSummary> {
  const sakenowaBrands = await deps.client.getBrands()

  return deps.db.transaction(async (tx) => {
    const existing = await tx.getExistingBrandHashes()
    let added = 0
    let updated = 0
    let unchanged = 0
    const toUpsert: BrandUpsert[] = []

    const total = sakenowaBrands.length
    for (let i = 0; i < total; i++) {
      const brand = sakenowaBrandToBrand(sakenowaBrands[i])
      const contentHash = computeContentHash(brand)
      const existingHash = existing.get(brand.brandId)

      if (existingHash === undefined) {
        toUpsert.push({ brand, contentHash })
        added++
      } else if (existingHash === contentHash) {
        unchanged++
      } else {
        toUpsert.push({ brand, contentHash })
        updated++
      }

      deps.onProgress?.(i + 1, total)
    }

    try {
      await tx.upsertBrandsBatch(toUpsert)
    } catch (err) {
      // The batch failed; we don't know exactly which row triggered it,
      // but PG's error.detail typically carries the offending value
      // (e.g. "Key (brewery_id)=(123) is not present in table breweries"
      // for FK violations). We forward that detail; if the operator
      // needs more, an env-gated per-row fallback could re-run the
      // batch one-at-a-time, but in practice the PG detail is enough.
      throw new Error(
        `Failed to upsert ${toUpsert.length} brand row(s) (added=${added}, updated=${updated}): ${formatPgError(err)}`,
        { cause: err },
      )
    }

    return { added, updated, unchanged, total }
  })
}

export function sakenowaBreweryToBrewery(s: SakenowaBrewery): Brewery {
  return {
    breweryId: s.id,
    name: s.name,
    nameKanji: s.name,
    areaId: s.areaId,
    source: 'sakenowa',
  }
}

export function computeBreweryContentHash(brewery: Brewery): string {
  const canonical = JSON.stringify({
    breweryId: brewery.breweryId,
    name: brewery.name,
    nameKanji: brewery.nameKanji,
    areaId: brewery.areaId,
    source: brewery.source,
    confidence: brewery.confidence ?? null,
  })
  return createHash('sha256').update(canonical).digest('hex')
}

export async function ingestBreweries(deps: BreweryIngestionDeps): Promise<RunSummary> {
  const sakenowaBreweries = await deps.client.getBreweries()

  return deps.db.transaction(async (tx) => {
    const existing = await tx.getExistingBreweryHashes()
    let added = 0
    let updated = 0
    let unchanged = 0
    const toUpsert: BreweryUpsert[] = []

    const total = sakenowaBreweries.length
    for (let i = 0; i < total; i++) {
      const brewery = sakenowaBreweryToBrewery(sakenowaBreweries[i])
      const contentHash = computeBreweryContentHash(brewery)
      const existingHash = existing.get(brewery.breweryId)

      if (existingHash === undefined) {
        toUpsert.push({ brewery, contentHash })
        added++
      } else if (existingHash === contentHash) {
        unchanged++
      } else {
        toUpsert.push({ brewery, contentHash })
        updated++
      }

      deps.onProgress?.(i + 1, total)
    }

    try {
      await tx.upsertBreweriesBatch(toUpsert)
    } catch (err) {
      throw new Error(
        `Failed to upsert ${toUpsert.length} brewery row(s) (added=${added}, updated=${updated}): ${formatPgError(err)}`,
        { cause: err },
      )
    }

    return { added, updated, unchanged, total }
  })
}

// PG errors carry actionable context in fields beyond .message — surface
// the SQLSTATE code, table, constraint, and detail (which often names
// the offending key value). Falls back to message + stringification.
function formatPgError(err: unknown): string {
  if (!(err instanceof Error)) return String(err)
  const pg = err as Error & {
    code?: string
    detail?: string
    table?: string
    constraint?: string
  }
  const parts = [err.message]
  if (pg.code) parts.push(`code=${pg.code}`)
  if (pg.table) parts.push(`table=${pg.table}`)
  if (pg.constraint) parts.push(`constraint=${pg.constraint}`)
  if (pg.detail) parts.push(`detail=${pg.detail}`)
  return parts.join(' | ')
}
