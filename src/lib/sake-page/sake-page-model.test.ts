import { describe, expect, it } from 'vitest'
import type { Brand } from '@/lib/schemas/brand'
import type { Brewery } from '@/lib/schemas/brewery'
import type { FlavorChart } from '@/lib/schemas/flavor-chart'
import { sakePageModel, type SakePageInput } from './sake-page-model'

const brand: Brand = {
  source: 'sakenowa',
  brandId: 1,
  name: '久保田',
  nameKanji: '久保田',
  nameRomaji: 'Kubota',
  breweryId: 10,
}

const brewery: Brewery = {
  source: 'sakenowa',
  breweryId: 10,
  name: '朝日酒造',
  nameKanji: '朝日酒造',
  nameRomaji: 'Asahi Shuzo',
  areaId: 15, // Niigata
}

const chart: FlavorChart = {
  source: 'sakenowa',
  brandId: 1,
  f1: 0.3,
  f2: 0.4,
  f3: 0.2,
  f4: 0.6,
  f5: 0.5,
  f6: 0.7,
}

function input(overrides: Partial<SakePageInput> = {}): SakePageInput {
  return {
    brand,
    brewery,
    flavorChart: chart,
    siblings: [],
    regionAnswer: () => "Niigata's sake is tanrei: light and clean. More follows.",
    ...overrides,
  }
}

describe('sakePageModel — the name', () => {
  it('names the sake in Latin letters where a transliteration exists', () => {
    expect(sakePageModel(input()).displayName).toBe('Kubota')
  })

  it('falls back to the kanji when there is no transliteration yet', () => {
    expect(sakePageModel(input({ brand: { ...brand, nameRomaji: null } })).displayName).toBe('久保田')
  })
})

describe('sakePageModel — the Sakenowa credit', () => {
  it('credits Sakenowa when the page shows a Sakenowa sake', () => {
    expect(sakePageModel(input()).showSakenowaAttribution).toBe(true)
  })

  it('does not credit Sakenowa for a hidden placeholder brewery when nothing shown is theirs', () => {
    const model = sakePageModel(
      input({
        brand: { ...brand, source: 'user_corrected' },
        brewery: { ...brewery, name: '', nameKanji: '', nameRomaji: null },
        flavorChart: null,
      }),
    )
    expect(model.showSakenowaAttribution).toBe(false)
  })

  it('credits Sakenowa for the flavor chart alone, even when the names were corrected by a user', () => {
    const model = sakePageModel(
      input({
        brand: { ...brand, source: 'user_corrected' },
        brewery: { ...brewery, source: 'user_corrected' },
      }),
    )
    expect(model.showSakenowaAttribution).toBe(true)
  })
})

describe('sakePageModel — the brewery line', () => {
  it('names the brewery in Latin letters with its prefecture', () => {
    const { brewery: line } = sakePageModel(input())
    expect(line).toMatchObject({ nameKanji: '朝日酒造', nameRomaji: 'Asahi Shuzo' })
    expect(line?.prefecture?.nameEn).toBe('Niigata')
  })

  it('hides the brewery when Sakenowa only knows a placeholder for it', () => {
    const model = sakePageModel(input({ brewery: { ...brewery, name: '', nameKanji: '', nameRomaji: null } }))
    expect(model.brewery).toBeNull()
  })

  it('hides the brewery when the catalogue has none for this sake', () => {
    expect(sakePageModel(input({ brewery: null })).brewery).toBeNull()
  })

  it('names the brewery older bottles carry when a rename is on record', () => {
    const model = sakePageModel(
      input({ brewery: { ...brewery, breweryId: 679, name: '獺祭', nameKanji: '獺祭', nameRomaji: 'Dassai' } }),
    )
    expect(model.brewery?.former).toEqual({ nameKanji: '旭酒造', nameRomaji: 'Asahi Shuzō' })
  })
})

describe('sakePageModel — the region line', () => {
  it('leads with the first sentence of the prefecture’s Learn entry and links it', () => {
    expect(sakePageModel(input()).region).toEqual({
      slug: 'region-niigata',
      lead: "Niigata's sake is tanrei: light and clean.",
      prefectureEn: 'Niigata',
    })
  })

  it('shows no region line for a prefecture Learn has not written about', () => {
    expect(sakePageModel(input({ brewery: { ...brewery, areaId: 13 } })).region).toBeNull()
  })

  it('shows no region line when the brewery is hidden', () => {
    const model = sakePageModel(input({ brewery: { ...brewery, name: '', nameKanji: '', nameRomaji: null } }))
    expect(model.region).toBeNull()
  })
})

describe('sakePageModel — a sake with no flavor chart', () => {
  it('tags the sake "little published" and offers no "Similar"', () => {
    const model = sakePageModel(input({ flavorChart: null }))
    expect(model.littlePublished).toBe(true)
    expect(model.offerSimilar).toBe(false)
  })

  it('still credits Sakenowa for the names it shows', () => {
    expect(sakePageModel(input({ flavorChart: null })).showSakenowaAttribution).toBe(true)
  })

  it('does neither for a sake with a chart', () => {
    const model = sakePageModel(input())
    expect(model.littlePublished).toBe(false)
    expect(model.offerSimilar).toBe(true)
  })
})

const sibling: Brand = { ...brand, brandId: 2, name: '越乃寒梅', nameKanji: '越乃寒梅', nameRomaji: null }

describe('sakePageModel — the brewery section', () => {
  it('shows the brewery with its other sakes when the mirror has some', () => {
    const model = sakePageModel(input({ siblings: [sibling] }))
    expect(model.brewerySection).toBe(model.brewery)
  })

  it('leaves the section out when the brewery has no other sake, rather than repeat its name', () => {
    expect(sakePageModel(input({ siblings: [] })).brewerySection).toBeNull()
  })

  it('leaves the section out for a hidden brewery, whatever its siblings', () => {
    const model = sakePageModel(
      input({ brewery: { ...brewery, name: '', nameKanji: '', nameRomaji: null }, siblings: [sibling] }),
    )
    expect(model.brewerySection).toBeNull()
  })
})

describe('sakePageModel — the transliteration caveat', () => {
  const kanjiOnly = { ...brand, nameRomaji: null }
  const kanjiOnlyBrewery = { ...brewery, nameRomaji: null }

  it('explains Latin names once when the sake has one', () => {
    expect(sakePageModel(input({ brewery: kanjiOnlyBrewery })).showRomajiDisclosure).toBe(true)
  })

  it('explains Latin names when only the brewery has one', () => {
    expect(sakePageModel(input({ brand: kanjiOnly })).showRomajiDisclosure).toBe(true)
  })

  it('explains Latin names when only another sake of the brewery shows one', () => {
    const model = sakePageModel(
      input({ brand: kanjiOnly, brewery: kanjiOnlyBrewery, siblings: [{ ...sibling, nameRomaji: 'Koshino Kanbai' }] }),
    )
    expect(model.showRomajiDisclosure).toBe(true)
  })

  it('says nothing about transliteration when every name is in kanji', () => {
    const model = sakePageModel(input({ brand: kanjiOnly, brewery: kanjiOnlyBrewery, siblings: [sibling] }))
    expect(model.showRomajiDisclosure).toBe(false)
  })

  it('ignores a hidden brewery’s Latin name', () => {
    const model = sakePageModel(
      input({ brand: kanjiOnly, brewery: { ...brewery, name: '', nameKanji: '', nameRomaji: 'Ghost' } }),
    )
    expect(model.showRomajiDisclosure).toBe(false)
  })
})
