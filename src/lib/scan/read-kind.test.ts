import { describe, expect, it, vi } from 'vitest'
import { firstReadStands, landLabel } from './read-kind'

const exact = { kind: 'exact' as const }

describe('where a read of a label lands', () => {
  it('asks the catalogue about one bottle of sake with writing on it', async () => {
    const lookUp = vi.fn(async () => exact)

    expect(await landLabel({ subject: 'one_bottle', legibility: 'read' }, lookUp)).toEqual(exact)
    expect(lookUp).toHaveBeenCalledTimes(1)
  })

  it('answers a menu, several bottles or no bottle without asking the catalogue', async () => {
    const lookUp = vi.fn(async () => exact)

    expect(await landLabel({ subject: 'menu' }, lookUp)).toEqual({ kind: 'not_one_bottle', subject: 'menu' })
    expect(await landLabel({ subject: 'no_bottle' }, lookUp)).toEqual({ kind: 'not_one_bottle', subject: 'no_bottle' })
    expect(lookUp).not.toHaveBeenCalled()
  })

  it('answers a side with no writing without asking the catalogue', async () => {
    const lookUp = vi.fn(async () => exact)

    expect(await landLabel({ subject: 'one_bottle', legibility: 'no_text' }, lookUp)).toEqual({ kind: 'no_text' })
    expect(lookUp).not.toHaveBeenCalled()
  })
})

describe('when the cheap first read stands', () => {
  it('stands on an exact match whose label printed the brewery, or did not say', () => {
    expect(firstReadStands('exact', true)).toBe(true)
    expect(firstReadStands('exact', undefined)).toBe(true)
  })

  it('is read again when the label left the brewery out, since the model may have supplied it', () => {
    expect(firstReadStands('exact', false)).toBe(false)
  })

  it.each(['not_sake', 'not_one_bottle', 'no_text', 'matched_brand_only', 'matched_brewery_only', 'ambiguous', 'no_match', 'low_confidence', 'failed'])(
    'is read again on %s',
    (kind) => {
      expect(firstReadStands(kind, true)).toBe(false)
    },
  )
})
