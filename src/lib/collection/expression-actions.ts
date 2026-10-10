'use server'

import { EXPRESSION_SCHEMA_VERSION, type Expression } from '@/lib/schemas/expression'
import {
  type AddOwnBottlingInput,
  AddOwnBottlingInputSchema,
} from '@/lib/schemas/expression-input'
import { lookupBrand } from '@/lib/sakenowa/lookup'
import { withMaintainerCollection } from '@/lib/taste/maintainer-collection'

/**
 * "Add your bottling" (design v1.6 §9 and §5, ADR-0025): a User names a
 * bottling of a sake the catalogue has, and it becomes an own Expression
 * linked to that sake. Maintainer-only, behind the same gate as the journal
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

  return withMaintainerCollection(async ({ userId, expressions }) => {
    const brand = await lookupBrand(brandId)
    if (!brand) return { status: 'not_found' }

    // The same name under the same sake is the same bottling: a second tap,
    // or coming back to add it again, lands on the one already there.
    const sameName = name.toLocaleLowerCase()
    const existing = (await expressions.read(userId)).find(
      (e) => e.brandId === brandId && e.name.toLocaleLowerCase() === sameName,
    )
    if (existing) return { status: 'ok', expressionId: existing.id }

    const now = Date.now()
    const expression: Expression = {
      schemaVersion: EXPRESSION_SCHEMA_VERSION,
      id: crypto.randomUUID(),
      own: true,
      brandId,
      line: { nameKanji: brand.nameKanji, nameRomaji: brand.nameRomaji },
      name,
      createdAt: now,
      updatedAt: now,
    }
    await expressions.put(userId, expression)
    return { status: 'ok', expressionId: expression.id }
  })
}
