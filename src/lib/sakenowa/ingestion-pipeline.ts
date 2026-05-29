/**
 * Sakenowa → brands ingestion. Idempotent: a second run on unchanged
 * source data writes zero rows. Failure-aborts: any throw inside the
 * transaction rolls back the entire run (no partial writes).
 *
 * The pipeline is theme-agnostic about its dependencies — it takes a
 * Sakenowa-shaped client and a BrandsDB-shaped database, both of which
 * can be faked in tests. Production wires `getBrands` from
 * `./client` and `makePgBrandsDB(pool)` from `./db`.
 */
import { createHash } from 'node:crypto'
import type { SakenowaBrand } from './client'
import type { BrandsDB } from './db'
import type { Brand } from '../schemas/brand'

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

      if (existingHash === undefined) {
        await tx.upsertBrand(brand, hash)
        added++
      } else if (existingHash === hash) {
        unchanged++
      } else {
        await tx.upsertBrand(brand, hash)
        updated++
      }

      deps.onProgress?.(i + 1, total)
    }

    return { added, updated, unchanged, total: sakenowaBrands.length }
  })
}
