import { describe, expect, it } from 'vitest'
import type { Expression } from '@/lib/schemas/expression'
import { bottlingPageModel, type BottlingPageInput } from './bottling-page-model'

/** "Wandering Poet", a bottling of Rihaku — a sake the catalogue has. */
const ofASake: Expression = {
  schemaVersion: 1,
  id: 'b1',
  own: true,
  brandId: 42,
  line: { nameKanji: '李白', nameRomaji: 'Rihaku' },
  name: 'Wandering Poet',
  createdAt: 1,
  updatedAt: 1,
}

/** Kept with "Keep it anyway": no sake behind it. */
const standalone: Expression = {
  schemaVersion: 1,
  id: 'b2',
  own: true,
  brandId: null,
  line: null,
  name: '富久千代',
  createdAt: 1,
  updatedAt: 1,
}

function input(overrides: Partial<BottlingPageInput> = {}): BottlingPageInput {
  return {
    bottling: ofASake,
    expressions: [ofASake, standalone],
    labels: { polishedTo: (n) => `Polished to ${n}%`, koji: (k) => `${k} koji` },
    ...overrides,
  }
}

describe('bottlingPageModel — the Sakenowa credit', () => {
  it('credits Sakenowa on a bottling of a catalogue sake, whose name is theirs', () => {
    const model = bottlingPageModel(input())
    expect(model.showSakenowaAttribution).toBe(true)
    expect(model.noCatalogueData).toBe(false)
  })

  it('shows no Sakenowa credit on a bottling with no sake, and marks the screen as holding no catalogue data', () => {
    const model = bottlingPageModel(input({ bottling: standalone }))
    expect(model.showSakenowaAttribution).toBe(false)
    expect(model.noCatalogueData).toBe(true)
  })
})

describe('bottlingPageModel — the line', () => {
  it('links back to the sake by its Latin name, with the kanji beside it', () => {
    expect(bottlingPageModel(input()).line).toEqual({ brandId: 42, name: 'Rihaku', kanji: '李白' })
  })

  it('names the sake by its kanji alone when there is no Latin reading', () => {
    const bottling = { ...ofASake, line: { nameKanji: '李白', nameRomaji: null } }
    expect(bottlingPageModel(input({ bottling })).line).toEqual({ brandId: 42, name: '李白', kanji: null })
  })

  it('has no line, so no line link, line block or chart, for a bottling with no sake', () => {
    expect(bottlingPageModel(input({ bottling: standalone })).line).toBeNull()
  })
})

describe('bottlingPageModel — what the visitor said about it', () => {
  it('tags grade, styles, polishing and koji in that order, from the visitor’s own fields', () => {
    const bottling: Expression = {
      ...ofASake,
      grade: 'junmai_ginjo',
      styles: ['Nama', 'Genshu'],
      polishingPct: 55,
      koji: 'yellow',
    }
    expect(bottlingPageModel(input({ bottling })).tags).toEqual([
      'Junmai Ginjō',
      'Nama',
      'Genshu',
      'Polished to 55%',
      'yellow koji',
    ])
  })

  it('has no tags when the visitor gave none', () => {
    expect(bottlingPageModel(input()).tags).toEqual([])
  })

  it('says the reading is the AI’s while the name or brewery is still the scan’s reading', () => {
    expect(bottlingPageModel(input({ bottling: { ...standalone, aiName: true } })).showReadingByAi).toBe(true)
    expect(bottlingPageModel(input({ bottling: { ...standalone, aiBrewery: true } })).showReadingByAi).toBe(true)
    expect(bottlingPageModel(input({ bottling: standalone })).showReadingByAi).toBe(false)
  })
})

describe('bottlingPageModel — other bottlings of the same sake', () => {
  const sibling: Expression = { ...ofASake, id: 'b3', name: 'Junmai Daiginjo' }
  const otherSake: Expression = { ...ofASake, id: 'b4', brandId: 7, line: { nameKanji: '獺祭', nameRomaji: 'Dassai' } }

  it('lists the visitor’s other bottlings of this sake, not this one or another sake’s', () => {
    const model = bottlingPageModel(input({ expressions: [ofASake, sibling, otherSake, standalone] }))
    expect(model.others.map((e) => e.id)).toEqual(['b3'])
  })

  it('lists none for a bottling with no sake, which has no line to share', () => {
    const alsoStandalone: Expression = { ...standalone, id: 'b5' }
    const model = bottlingPageModel(input({ bottling: standalone, expressions: [standalone, alsoStandalone] }))
    expect(model.others).toEqual([])
  })
})
