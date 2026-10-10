import { describe, expect, it } from 'vitest'
import { pickCollectionSegment } from '@/lib/collection/segment'

describe('which Collection segment opens', () => {
  it('opens the one a link names', () => {
    expect(pickCollectionSegment('cellar', 'journal')).toBe('cellar')
    expect(pickCollectionSegment('journal', 'cellar')).toBe('journal')
  })

  it('otherwise opens the one the visitor was last on', () => {
    expect(pickCollectionSegment(undefined, 'cellar')).toBe('cellar')
  })

  it('opens Journal for a new visitor, and ignores anything unknown', () => {
    expect(pickCollectionSegment(undefined, undefined)).toBe('journal')
    expect(pickCollectionSegment('wishlist', 'nonsense')).toBe('journal')
    expect(pickCollectionSegment(['cellar', 'journal'], undefined)).toBe('journal')
  })
})
