'use server'

import {
  type CellarSubject,
  addBottle,
  finishBottle,
  openBottle,
  removeBottle,
} from '@/lib/collection/cellar'
import { type CellarBottle, cellarRowKey } from '@/lib/schemas/cellar-bottle'
import { type CellarTarget, CellarTargetSchema } from '@/lib/schemas/cellar-input'
import { lookupBrand } from '@/lib/sakenowa/lookup'
import { type MaintainerCollection, withMaintainerCollection } from '@/lib/taste/maintainer-collection'

/**
 * The Cellar's write actions (design v1.4 §11, ADR-0024): add a bottle, open
 * one, finish one, remove one. Each is a read-modify-write of one row
 * through the pure rules in `cellar.ts`, behind the same maintainer gate as
 * the journal (ADR-0020). Not rate-limited, for the journal actions' reason.
 *
 * A row is a sake's, or one bottling's (design v1.6.1, ADR-0025): each action
 * takes a {@link CellarTarget} saying which.
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

/** The store key of the row a target names. */
function rowKeyOf(target: CellarTarget): string {
  return 'expressionId' in target
    ? cellarRowKey({ brandId: null, expression: { id: target.expressionId, name: '-' } })
    : cellarRowKey({ brandId: target.brandId })
}

/** What a new row for this target holds bottles of, or `null` if there is no such thing. */
async function subjectOf(
  target: CellarTarget,
  { userId, expressions }: MaintainerCollection,
): Promise<CellarSubject | null> {
  if ('expressionId' in target) {
    // The bottling has to be the caller's own.
    const bottling = (await expressions.read(userId)).find((e) => e.id === target.expressionId)
    if (!bottling) return null
    return {
      brandId: bottling.brandId,
      // With no sake the bottling's own name stands in, as in a JournalEntry.
      nameKanji: bottling.line?.nameKanji ?? bottling.name,
      nameRomaji: bottling.line?.nameRomaji ?? null,
      expression: { id: bottling.id, name: bottling.name },
    }
  }
  const brand = await lookupBrand(target.brandId)
  if (!brand) return null
  return { brandId: brand.brandId, nameKanji: brand.nameKanji, nameRomaji: brand.nameRomaji }
}

/** "Add to cellar": a new row of one, or one more bottle on the row. */
export async function addToCellar(target: CellarTarget): Promise<CellarActionResult> {
  const parsed = CellarTargetSchema.safeParse(target)
  if (!parsed.success) return { status: 'invalid_input' }
  return withMaintainerCollection(async (collection) => {
    const { userId, cellar } = collection
    const key = rowKeyOf(parsed.data)
    const existing = (await cellar.read(userId)).find((b) => cellarRowKey(b) === key)
    let next: CellarBottle
    if (existing) {
      // The row already knows what it holds; no lookup needed.
      next = addBottle(existing, { brandId: existing.brandId, ...existing.sake }, Date.now())
    } else {
      const subject = await subjectOf(parsed.data, collection)
      if (!subject) return { status: 'not_found' }
      next = addBottle(undefined, subject, Date.now())
    }
    await cellar.put(userId, next)
    return { status: 'ok', count: next.count }
  })
}

/** "Open a bottle". */
export async function openCellarBottle(target: CellarTarget): Promise<CellarActionResult> {
  return change(target, (row, now) => openBottle(row, now))
}

/** "Finished": one bottle fewer, the rest sealed; the last one takes the row. */
export async function finishCellarBottle(target: CellarTarget): Promise<CellarActionResult> {
  return change(target, (row, now) => finishBottle(row, now))
}

/** "Remove": one bottle fewer; the last one takes the row. */
export async function removeFromCellar(target: CellarTarget): Promise<CellarActionResult> {
  return change(target, (row, now) => removeBottle(row, now))
}

async function change(
  target: CellarTarget,
  apply: (row: CellarBottle, now: number) => CellarBottle | null,
): Promise<CellarActionResult> {
  const parsed = CellarTargetSchema.safeParse(target)
  if (!parsed.success) return { status: 'invalid_input' }
  return withMaintainerCollection(async ({ userId, cellar }) => {
    const key = rowKeyOf(parsed.data)
    const row = (await cellar.read(userId)).find((b) => cellarRowKey(b) === key)
    if (!row) return { status: 'not_found' }
    const next = apply(row, Date.now())
    if (next === null) {
      await cellar.remove(userId, key)
      return { status: 'ok', count: 0 }
    }
    await cellar.put(userId, next)
    return { status: 'ok', count: next.count }
  })
}
