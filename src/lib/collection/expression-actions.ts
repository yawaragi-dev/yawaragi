'use server'

import { EXPRESSION_SCHEMA_VERSION, type Expression } from '@/lib/schemas/expression'
import {
  type AddOwnBottlingInput,
  AddOwnBottlingInputSchema,
} from '@/lib/schemas/expression-input'
import { lookupBrand } from '@/lib/sakenowa/lookup'
import { withMaintainerCollection } from '@/lib/taste/maintainer-collection'

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
      createdAt: now,
      updatedAt: now,
    }
    await expressions.put(userId, expression)
    return { status: 'ok', expressionId: expression.id }
  })
}
