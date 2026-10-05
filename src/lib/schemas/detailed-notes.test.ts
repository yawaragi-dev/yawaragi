import { describe, expect, it } from 'vitest'
import {
  DetailedNotesSchema,
  compactDetailedNotes,
  isPartFilled,
} from '@/lib/schemas/detailed-notes'

describe('detailed notes', () => {
  it('accepts a sheet with only one part filled — every part is optional', () => {
    expect(DetailedNotesSchema.safeParse({ palate: { body: 3 } }).success).toBe(true)
  })

  it('stores palate scales as steps 1 to 5 only', () => {
    expect(DetailedNotesSchema.safeParse({ palate: { body: 0 } }).success).toBe(false)
    expect(DetailedNotesSchema.safeParse({ palate: { body: 6 } }).success).toBe(false)
  })

  it('stores keys, not words, so the copy can change without a migration', () => {
    expect(DetailedNotesSchema.safeParse({ appearance: { clarity: 'Slightly hazy' } }).success).toBe(
      false,
    )
    expect(DetailedNotesSchema.safeParse({ appearance: { clarity: 'slightlyHazy' } }).success).toBe(
      true,
    )
  })

  it('counts a part as filled only when it holds a value', () => {
    expect(isPartFilled({ nose: { aromas: [] } }, 'nose')).toBe(false)
    expect(isPartFilled({ nose: { aromas: ['koji'] } }, 'nose')).toBe(true)
    expect(isPartFilled({ serve: { with: '  ' } }, 'serve')).toBe(false)
    expect(isPartFilled(undefined, 'palate')).toBe(false)
  })

  it('drops empty values and empty parts before saving, and nothing at all when nothing is left', () => {
    expect(
      compactDetailedNotes({
        nose: { aromas: [] },
        serve: { with: ' grilled fish ', vessel: undefined },
        palate: {},
      }),
    ).toEqual({ serve: { with: 'grilled fish' } })
    expect(compactDetailedNotes({ nose: { aromas: [] } })).toBeUndefined()
  })
})
