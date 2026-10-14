'use server'

import {
  type CollectionWrites,
  type DeletedBottling,
  deleteBottlingWrites,
  renameBottlingWrites,
} from '@/lib/collection/bottling-changes'
import { readSettledCellar } from '@/lib/collection/settled-cellar'
import { EXPRESSION_SCHEMA_VERSION, type Expression, ExpressionSchema } from '@/lib/schemas/expression'
import {
  type AddOwnBottlingInput,
  AddOwnBottlingInputSchema,
  type DeletedBottlingInput,
  DeletedBottlingSchema,
  type RenameOwnBottlingInput,
  RenameOwnBottlingInputSchema,
} from '@/lib/schemas/expression-input'
import { lookupBrand } from '@/lib/sakenowa/lookup'
import { type MaintainerCollection, withMaintainerCollection } from '@/lib/taste/maintainer-collection'

/**
 * Adding a bottling of your own (design v1.6, ADR-0025). With a sake — "Add
 * your bottling" on §9 — it becomes an own Expression linked to that sake.
 * Without one — "Keep it anyway" on a scan outcome (§5a), "Add it yourself" in
 * search (§8) — it stands alone, with the brewery as read or typed, until the
 * sake turns up in the catalogue. Maintainer-only, behind the same gate as the journal
 * (ADR-0020), and not rate-limited for the journal actions' reason.
 */
export type AddOwnBottlingResult =
  | { status: 'ok'; expressionId: string }
  | { status: 'invalid_input' }
  /** The sake is not in the catalogue. */
  | { status: 'not_found' }
  | { status: 'forbidden' }
  | { status: 'unavailable' }

export async function addOwnBottling(input: AddOwnBottlingInput): Promise<AddOwnBottlingResult> {
  const parsed = AddOwnBottlingInputSchema.safeParse(input)
  if (!parsed.success) return { status: 'invalid_input' }
  const { brandId, name } = parsed.data
  const brewery = parsed.data.brandId === null ? parsed.data.brewery || undefined : undefined
  const aiName = parsed.data.brandId === null && parsed.data.aiName
  const aiBrewery = parsed.data.brandId === null && brewery !== undefined && parsed.data.aiBrewery

  return withMaintainerCollection(async ({ userId, expressions }) => {
    const brand = brandId === null ? null : await lookupBrand(brandId)
    if (brandId !== null && !brand) return { status: 'not_found' }

    // The same name under the same sake — or the same name and brewery with no
    // sake — is the same bottling: a second tap, or coming back to add it
    // again, lands on the one already there.
    const sameName = name.toLocaleLowerCase()
    const existing = (await expressions.read(userId)).find(
      (e) =>
        e.brandId === brandId &&
        e.name.toLocaleLowerCase() === sameName &&
        (e.brewery ?? '').toLocaleLowerCase() === (brewery ?? '').toLocaleLowerCase(),
    )
    if (existing) return { status: 'ok', expressionId: existing.id }

    const now = Date.now()
    const expression: Expression = {
      schemaVersion: EXPRESSION_SCHEMA_VERSION,
      id: crypto.randomUUID(),
      own: true,
      brandId,
      line: brand ? { nameKanji: brand.nameKanji, nameRomaji: brand.nameRomaji } : null,
      name,
      ...(brewery ? { brewery } : {}),
      ...(aiName ? { aiName: true as const } : {}),
      ...(aiBrewery ? { aiBrewery: true as const } : {}),
      createdAt: now,
      updatedAt: now,
    }
    await expressions.put(userId, expression)
    return { status: 'ok', expressionId: expression.id }
  })
}

/** Carry out a set of writes against the journal and the cellar. */
async function apply({ userId, journal, cellar }: MaintainerCollection, writes: CollectionWrites) {
  for (const entry of writes.putEntries) await journal.put(userId, entry)
  for (const id of writes.removeEntryIds) await journal.remove(userId, id)
  // Removes before puts: a delete folds a bottling's row into its sake's, and
  // the two never share a key, but the order keeps that true by construction.
  for (const key of writes.removeCellarKeys) await cellar.remove(userId, key)
  for (const row of writes.putCellar) await cellar.put(userId, row)
}

export type RenameOwnBottlingResult =
  | { status: 'ok' }
  | { status: 'invalid_input' }
  | { status: 'not_found' }
  | { status: 'forbidden' }
  | { status: 'unavailable' }

/**
 * "Rename" (design v1.6.2 §9a). The new name reaches every tasting and cellar
 * row of the bottling, which each carry a copy of it. This is also the
 * rectification path for the record (ADR-0009).
 */
export async function renameOwnBottling(
  input: RenameOwnBottlingInput,
): Promise<RenameOwnBottlingResult> {
  const parsed = RenameOwnBottlingInputSchema.safeParse(input)
  if (!parsed.success) return { status: 'invalid_input' }
  const { expressionId, name } = parsed.data

  return withMaintainerCollection(async (collection) => {
    const { userId, expressions, journal } = collection
    const existing = (await expressions.read(userId)).find((e) => e.id === expressionId)
    if (!existing) return { status: 'not_found' }

    const now = Date.now()
    const next: Record<string, unknown> = { ...existing, name, updatedAt: now }
    // A name the visitor wrote is theirs, not a reading (design v1.7.1, H3).
    if (name !== existing.name) delete next.aiName
    // The brewery is the visitor's to set only while there is no sake.
    if (existing.brandId === null && parsed.data.brewery !== undefined) {
      if (parsed.data.brewery) next.brewery = parsed.data.brewery
      else delete next.brewery
      if ((parsed.data.brewery || undefined) !== existing.brewery) delete next.aiBrewery
    }
    const checked = ExpressionSchema.safeParse(next)
    if (!checked.success) return { status: 'invalid_input' }

    const [entries, rows] = await Promise.all([journal.read(userId), readSettledCellar(collection)])
    await expressions.put(userId, checked.data)
    await apply(collection, renameBottlingWrites(checked.data, { entries, cellar: rows }, now))
    return { status: 'ok' }
  })
}

export type DeleteOwnBottlingResult =
  /** `undo` is what {@link restoreOwnBottling} takes to put it all back. */
  | { status: 'ok'; undo: DeletedBottling }
  | { status: 'invalid_input' }
  | { status: 'not_found' }
  | { status: 'forbidden' }
  | { status: 'unavailable' }

/**
 * "Delete bottling" (design v1.6.2 §9a). With a sake, the bottling's tastings
 * and cellar bottles fall back to the sake; with none, they go with it. The
 * per-record erasure path for the record (ADR-0009).
 */
export async function deleteOwnBottling(expressionId: string): Promise<DeleteOwnBottlingResult> {
  if (typeof expressionId !== 'string' || expressionId.length === 0 || expressionId.length > 64) {
    return { status: 'invalid_input' }
  }
  return withMaintainerCollection(async (collection) => {
    const { userId, expressions, journal } = collection
    const existing = (await expressions.read(userId)).find((e) => e.id === expressionId)
    if (!existing) return { status: 'not_found' }

    const [entries, rows] = await Promise.all([journal.read(userId), readSettledCellar(collection)])
    const { writes, undo } = deleteBottlingWrites(existing, { entries, cellar: rows }, Date.now())
    await apply(collection, writes)
    // Last, so that a failure above leaves the bottling there to try again.
    await expressions.remove(userId, existing.id)
    return { status: 'ok', undo }
  })
}

export type RestoreOwnBottlingResult =
  | { status: 'ok' }
  | { status: 'invalid_input' }
  | { status: 'forbidden' }
  | { status: 'unavailable' }

/** "Undo" after a delete: the bottling, its tastings and its cellar rows, as they were. */
export async function restoreOwnBottling(
  deleted: DeletedBottlingInput,
): Promise<RestoreOwnBottlingResult> {
  const parsed = DeletedBottlingSchema.safeParse(deleted)
  if (!parsed.success) return { status: 'invalid_input' }
  const { expression, entries, cellar: rows, createdCellarKeys } = parsed.data

  // A row the delete created can only have been the sake's own.
  if (expression.brandId !== null) {
    const sakeKeyPrefix = String(expression.brandId)
    if (!createdCellarKeys.every((key) => key === sakeKeyPrefix || key.startsWith(`${sakeKeyPrefix}|`))) {
      return { status: 'invalid_input' }
    }
  }

  return withMaintainerCollection(async (collection) => {
    const { userId, expressions } = collection
    // The bottling first: its tastings and rows point at it.
    await expressions.put(userId, expression)
    await apply(collection, {
      putEntries: entries,
      removeEntryIds: [],
      putCellar: rows,
      removeCellarKeys: createdCellarKeys,
    })
    return { status: 'ok' }
  })
}
