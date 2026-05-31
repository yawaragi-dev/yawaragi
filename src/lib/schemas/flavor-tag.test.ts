import { describe, expect, it } from 'vitest'
import { FlavorTagSchema, parseFlavorTag } from './flavor-tag'

const validTag = {
  source: 'sakenowa',
  tagId: 3,
  name: '辛口',
} as const

describe('FlavorTag schema', () => {
  it('parses a valid Sakenowa-sourced flavor tag', () => {
    expect(parseFlavorTag(validTag)).toEqual(validTag)
  })

  it('accepts confidence on the WithProvenance mixin', () => {
    expect(parseFlavorTag({ ...validTag, source: 'llm_extracted', confidence: 0.4 })).toMatchObject(
      { confidence: 0.4 },
    )
  })

  it('rejects a tag without a source', () => {
    expect(() => parseFlavorTag({ tagId: 3, name: '辛口' })).toThrow()
  })

  it('rejects a tag with an unknown source value', () => {
    expect(() => parseFlavorTag({ ...validTag, source: 'mystery_provider' })).toThrow()
  })

  it('rejects a non-positive tagId', () => {
    expect(() => parseFlavorTag({ ...validTag, tagId: 0 })).toThrow()
    expect(() => parseFlavorTag({ ...validTag, tagId: -1 })).toThrow()
  })

  it('rejects non-integer tagId', () => {
    expect(() => parseFlavorTag({ ...validTag, tagId: 1.5 })).toThrow()
  })

  it('rejects empty name', () => {
    expect(() => parseFlavorTag({ ...validTag, name: '' })).toThrow()
  })

  it('exposes FlavorTagSchema for composition', () => {
    expect(FlavorTagSchema.parse(validTag)).toEqual(validTag)
  })
})
