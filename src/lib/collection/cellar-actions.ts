'use server'

import { z } from 'zod'
import { addBottle, finishBottle, openBottle, removeBottle } from '@/lib/collection/cellar'
import type { CellarBottle } from '@/lib/schemas/cellar-bottle'
import { lookupBrand } from '@/lib/sakenowa/lookup'
import { withMaintainerCollection } from '@/lib/taste/maintainer-collection'

/**
 * The Cellar's write actions (design v1.4 §11, ADR-0024): add a bottle, open
 * one, finish one, remove one. Each is a read-modify-write of one row
 * through the pure rules in `cellar.ts`, behind the same maintainer gate as
 * the journal (ADR-0020). Not rate-limited, for the journal actions' reason.
 *
 * Each returns the row's count afterwards (0 when the row is gone), which is
 * all the buttons need to relabel themselves ("In cellar · 2"); lists refresh
 * with `router.refresh()`.
 */
export type CellarActionResult =
  | { status: 'ok'; count: number }
  | { status: 'invalid_input' }
  | { status: 'not_found' }
  | { status: 'forbidden' }
  | { status: 'unavailable' }

const BrandId = z.number().int().positive()

/** "Add to cellar": a new row of one, or one more bottle on the row. */
export async function addToCellar(brandId: number): Promise<CellarActionResult> {
  if (!BrandId.safeParse(brandId).success) return { status: 'invalid_input' }
  return withMaintainerCollection(async ({ userId, cellar }) => {
    const existing = (await cellar.read(userId)).find((b) => b.brandId === brandId)
    let sake = existing?.sake
    if (!sake) {
      const brand = await lookupBrand(brandId)
      if (!brand) return { status: 'not_found' }
      sake = { nameKanji: brand.nameKanji, nameRomaji: brand.nameRomaji }
    }
    const next = addBottle(existing, { brandId, ...sake }, Date.now())
    await cellar.put(userId, next)
    return { status: 'ok', count: next.count }
  })
}

/** "Open a bottle". */
export async function openCellarBottle(brandId: number): Promise<CellarActionResult> {
  return change(brandId, (row, now) => openBottle(row, now))
}

/** "Finished": one bottle fewer, the rest sealed; the last one takes the row. */
export async function finishCellarBottle(brandId: number): Promise<CellarActionResult> {
  return change(brandId, (row, now) => finishBottle(row, now))
}

/** "Remove": one bottle fewer; the last one takes the row. */
export async function removeFromCellar(brandId: number): Promise<CellarActionResult> {
  return change(brandId, (row, now) => removeBottle(row, now))
}

async function change(
  brandId: number,
  apply: (row: CellarBottle, now: number) => CellarBottle | null,
): Promise<CellarActionResult> {
  if (!BrandId.safeParse(brandId).success) return { status: 'invalid_input' }
  return withMaintainerCollection(async ({ userId, cellar }) => {
    const row = (await cellar.read(userId)).find((b) => b.brandId === brandId)
    if (!row) return { status: 'not_found' }
    const next = apply(row, Date.now())
    if (next === null) {
      await cellar.remove(userId, brandId)
      return { status: 'ok', count: 0 }
    }
    await cellar.put(userId, next)
    return { status: 'ok', count: next.count }
  })
}
