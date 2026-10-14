import { describe, expect, it } from 'vitest'
import { bottlingNameFromRead, ownBottlingForRead } from './read-bottling'

describe('bottlingNameFromRead', () => {
  it('offers the line, the product name and the grade the label prints', () => {
    expect(bottlingNameFromRead('Mizuo', { product_name: '一味', grade: 'junmai' })).toBe('Mizuo 一味 Junmai')
  })

  it('leads a kanji product name with its reading, for a visitor who cannot read it', () => {
    expect(
      bottlingNameFromRead('Mizuo', { product_name: '一味', product_name_romaji: 'Ichiaji', grade: 'junmai' }),
    ).toBe('Mizuo Ichiaji (一味) Junmai')
    expect(
      bottlingNameFromRead('Rihaku', { product_name: 'Wandering Poet', product_name_romaji: 'Wandering Poet' }),
    ).toBe('Rihaku Wandering Poet')
  })

  it('adds style words after the grade, two at most', () => {
    expect(
      bottlingNameFromRead('Ikekame', { grade: 'junmai_ginjo', styles: ['nama', 'genshu', 'muroka'] }),
    ).toBe('Ikekame Junmai Ginjō Nama Genshu')
  })

  it('offers nothing when the label adds nothing to the line’s name', () => {
    expect(bottlingNameFromRead('Dassai', undefined)).toBeNull()
    expect(bottlingNameFromRead('Dassai', {})).toBeNull()
    expect(bottlingNameFromRead('Dassai', { polishing_ratio: 45 })).toBeNull()
  })

  it('does not repeat a product name that is the line’s name again', () => {
    expect(bottlingNameFromRead('Rihaku', { product_name: 'RIHAKU', grade: 'junmai_ginjo' })).toBe('Rihaku Junmai Ginjō')
  })
})

describe('ownBottlingForRead', () => {
  const own = [
    { id: 'a', name: 'Mizuo Junmai Ginjo' },
    { id: 'b', name: 'Mizuo 一味 Junmai' },
    { id: 'c', name: 'Mizuo Daiginjō' },
  ]

  it('finds the bottling whose name carries the product name on the label', () => {
    expect(ownBottlingForRead({ product_name: '一味', grade: 'junmai' }, own)?.id).toBe('b')
  })

  it('finds a bottling by its grade, however the visitor spelled it', () => {
    expect(ownBottlingForRead({ grade: 'junmai_ginjo' }, own)?.id).toBe('a')
    expect(ownBottlingForRead({ grade: 'daiginjo' }, own)?.id).toBe('c')
  })

  it('does not take a junmai ginjō for a junmai', () => {
    expect(ownBottlingForRead({ grade: 'junmai' }, [own[0]])).toBeNull()
  })

  it('gives no answer when two bottlings fit equally', () => {
    const two = [
      { id: 'x', name: 'Rihaku Junmai Ginjo 2023' },
      { id: 'y', name: 'Rihaku Junmai Ginjo 2024' },
    ]
    expect(ownBottlingForRead({ grade: 'junmai_ginjo' }, two)).toBeNull()
  })

  it('gives no answer when the label says nothing about the bottling', () => {
    expect(ownBottlingForRead(undefined, own)).toBeNull()
    expect(ownBottlingForRead({}, own)).toBeNull()
  })
})
