import { describe, expect, it } from 'vitest'
import { EXPRESSION_SCHEMA_VERSION, ExpressionSchema } from '@/lib/schemas/expression'

const base = {
  schemaVersion: EXPRESSION_SCHEMA_VERSION,
  id: 'e1',
  own: true,
  name: 'Rihaku Wandering Poet',
  createdAt: 1000,
  updatedAt: 1000,
} as const

const line = { nameKanji: '李白', nameRomaji: 'Rihaku' }

describe('an own bottling', () => {
  it('can belong to a sake from the catalogue', () => {
    expect(ExpressionSchema.safeParse({ ...base, brandId: 12, line }).success).toBe(true)
  })

  it('can stand alone when its sake is not in the catalogue, with the brewery as typed', () => {
    const parsed = ExpressionSchema.safeParse({
      ...base,
      name: '富久千代',
      brandId: null,
      line: null,
      brewery: '盛田屋',
    })
    expect(parsed.success).toBe(true)
  })

  it('trims the name and refuses an empty one', () => {
    const parsed = ExpressionSchema.parse({ ...base, name: '  富久千代 ', brandId: null, line: null })
    expect(parsed.name).toBe('富久千代')
    expect(ExpressionSchema.safeParse({ ...base, name: '   ', brandId: null, line: null }).success).toBe(false)
  })

  it('never names a sake without saying which one, or the other way round', () => {
    expect(ExpressionSchema.safeParse({ ...base, brandId: 12, line: null }).success).toBe(false)
    expect(ExpressionSchema.safeParse({ ...base, brandId: null, line }).success).toBe(false)
  })

  it('takes its brewery from the catalogue once it belongs to a sake', () => {
    expect(ExpressionSchema.safeParse({ ...base, brandId: 12, line, brewery: '李白酒造' }).success).toBe(false)
  })

  it('is always marked as added by its author', () => {
    expect(ExpressionSchema.safeParse({ ...base, own: false, brandId: null, line: null }).success).toBe(false)
  })
})
