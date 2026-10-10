import { describe, expect, it } from 'vitest'
import { withFormerBreweryNames } from './former-brewery-names'

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
