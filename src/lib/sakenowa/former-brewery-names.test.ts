import { describe, expect, it } from 'vitest'
import { formerBreweryNameOf, withFormerBreweryNames } from './former-brewery-names'

describe('withFormerBreweryNames', () => {
  it("adds a brewery's current name when the label prints its former one", () => {
    // Asahi Shuzo became 株式会社獺祭 in June 2025; older Dassai bottles say 旭酒造.
    expect(withFormerBreweryNames(['旭酒造', '旭酒造店'])).toEqual(['旭酒造', '旭酒造店', '獺祭'])
  })

  it('leaves every other brewery as it is', () => {
    expect(withFormerBreweryNames(['高木酒造'])).toEqual(['高木酒造'])
  })

  it('does not repeat a name already in the list', () => {
    expect(withFormerBreweryNames(['旭酒造', '獺祭'])).toEqual(['旭酒造', '獺祭'])
  })
})

describe('formerBreweryNameOf', () => {
  it('gives the name older Dassai bottles carry, for the brewery now called 獺祭', () => {
    expect(formerBreweryNameOf({ breweryId: 679, nameKanji: '獺祭' })).toEqual({
      nameKanji: '旭酒造',
      nameRomaji: 'Asahi Shuzō',
    })
  })

  it('gives nothing for a brewery with no rename on record', () => {
    expect(formerBreweryNameOf({ breweryId: 1, nameKanji: '高木酒造' })).toBeNull()
  })

  it('gives nothing for the other brewery that is still called 旭酒造', () => {
    // 伊勢旭's brewery (Mie) keeps the name Dassai's gave up.
    expect(formerBreweryNameOf({ breweryId: 1905, nameKanji: '旭酒造' })).toBeNull()
  })

  it('gives nothing when the id now belongs to a brewery of another name', () => {
    expect(formerBreweryNameOf({ breweryId: 679, nameKanji: '別の蔵' })).toBeNull()
  })
})
