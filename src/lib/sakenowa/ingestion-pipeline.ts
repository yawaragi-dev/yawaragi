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
 */
import { createHash } from 'node:crypto'
import type { SakenowaBrand, SakenowaBrewery } from './client'
import type { BrandsDB, BreweriesDB } from './db'
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
   * Optional. Called after each row is classified (and upserted, if
   * applicable). `current` is 1-indexed; `current === total` on the final
   * call. The pipeline doesn't throttle — callers that hit stdout / a UI
   * should throttle themselves.
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

    const total = sakenowaBrands.length
    for (let i = 0; i < total; i++) {
      const sBrand = sakenowaBrands[i]
      const brand = sakenowaBrandToBrand(sBrand)
      const hash = computeContentHash(brand)
      const existingHash = existing.get(brand.brandId)

      try {
        if (existingHash === undefined) {
          await tx.upsertBrand(brand, hash)
          added++
        } else if (existingHash === hash) {
          unchanged++
        } else {
          await tx.upsertBrand(brand, hash)
          updated++
        }
      } catch (err) {
        // Surface the row identifiers so an FK / constraint failure
        // points at the offending Sakenowa row without the operator
        // having to add prints. IDs are Sakenowa-public, no PII.
        throw new Error(
          `Failed to upsert brand brandId=${brand.brandId} breweryId=${brand.breweryId} (${i + 1}/${total}): ${err instanceof Error ? err.message : String(err)}`,
          { cause: err },
        )
      }

      deps.onProgress?.(i + 1, total)
    }

    return { added, updated, unchanged, total: sakenowaBrands.length }
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

    const total = sakenowaBreweries.length
    for (let i = 0; i < total; i++) {
      const sBrewery = sakenowaBreweries[i]
      const brewery = sakenowaBreweryToBrewery(sBrewery)
      const hash = computeBreweryContentHash(brewery)
      const existingHash = existing.get(brewery.breweryId)

      try {
        if (existingHash === undefined) {
          await tx.upsertBrewery(brewery, hash)
          added++
        } else if (existingHash === hash) {
          unchanged++
        } else {
          await tx.upsertBrewery(brewery, hash)
          updated++
        }
      } catch (err) {
        throw new Error(
          `Failed to upsert brewery breweryId=${brewery.breweryId} areaId=${brewery.areaId} (${i + 1}/${total}): ${err instanceof Error ? err.message : String(err)}`,
          { cause: err },
        )
      }

      deps.onProgress?.(i + 1, total)
    }

    return { added, updated, unchanged, total: sakenowaBreweries.length }
  })
}
