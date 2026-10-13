import { describe, expect, it } from 'vitest'
import { canJudge, judgeLanding, type Landing } from './judge'
import { GroundTruthEntrySchema, photoKind } from './schemas'

const none: Landing = { kind: 'none' }
const one = (brandId: number): Landing => ({ kind: 'one', brandId })
const list = (...brandIds: number[]): Landing => ({ kind: 'list', brandIds })

const provenance = { source: 'maintainer_shop_photo', rightsCleared: true } as const
const base = { name_ja: '七田', brewery_ja: '天山酒造', provenance }

describe('a photo of one sake bottle', () => {
  const inCatalogue = { expectedBrandIds: [968] }
  const notInCatalogue = { expectedBrandIds: [] }

  it('is right when the scan shows that sake', () => {
    expect(judgeLanding(inCatalogue, one(968))).toBe('right')
  })

  it('is wrong when the scan shows another sake', () => {
    expect(judgeLanding(inCatalogue, one(1))).toBe('wrong')
  })

  it('is in the list when the sake is among several candidates', () => {
    expect(judgeLanding(inCatalogue, list(1, 968))).toBe('in_list')
    expect(judgeLanding(inCatalogue, list(1, 2))).toBe('wrong')
  })

  it('is none when the scan finds nothing for a sake the catalogue has', () => {
    expect(judgeLanding(inCatalogue, none)).toBe('none')
  })

  it('is right when the scan finds nothing for a sake the catalogue lacks, and wrong otherwise', () => {
    expect(judgeLanding(notInCatalogue, none)).toBe('right')
    expect(judgeLanding(notInCatalogue, one(1))).toBe('wrong')
    expect(judgeLanding(notInCatalogue, list(1, 2))).toBe('wrong')
  })
})

describe('a photo of a bottle that is not sake', () => {
  const shochu = { drink: 'shochu', expectedBrandIds: [] } as const
  const shochuListedInSakenowa = { drink: 'shochu', expectedBrandIds: [3935] } as const

  it('is right when no sake is shown', () => {
    expect(judgeLanding(shochu, none)).toBe('right')
  })

  it('is wrong when a sake is shown, alone or in a list', () => {
    expect(judgeLanding(shochu, one(1002))).toBe('wrong')
    expect(judgeLanding(shochu, list(1002, 2611))).toBe('wrong')
  })

  it('is neither right nor wrong when the scan lands on the row Sakenowa keeps for that very product', () => {
    expect(judgeLanding(shochuListedInSakenowa, one(3935))).toBe('in_photo')
    expect(judgeLanding(shochuListedInSakenowa, list(3090, 3935))).toBe('in_list')
    expect(judgeLanding(shochuListedInSakenowa, one(3090))).toBe('wrong')
    expect(judgeLanding(shochuListedInSakenowa, none)).toBe('right')
  })
})

describe('a photo of a menu', () => {
  const menu = {
    subject: 'menu',
    items: [
      { name_ja: '獺祭', expectedBrandIds: [887] },
      { name_ja: '七田', drink: 'shochu', expectedBrandIds: [] },
    ],
  } as const

  it('is right when the scan does not present one sake as if the menu were a bottle', () => {
    expect(judgeLanding(menu, none)).toBe('right')
  })

  it('does not count a sake that is on the menu as right', () => {
    expect(judgeLanding(menu, one(887))).toBe('in_photo')
    expect(judgeLanding(menu, list(887, 1))).toBe('in_list')
  })

  it('is wrong when the scan shows a sake the menu does not list', () => {
    expect(judgeLanding(menu, one(968))).toBe('wrong')
  })
})

describe('a photo of several bottles', () => {
  const twoEqual = {
    subject: 'several_bottles',
    items: [
      { name_ja: '獺祭', expectedBrandIds: [887] },
      { name_ja: '李白', expectedBrandIds: [846] },
    ],
  } as const
  const oneInFront = {
    subject: 'several_bottles',
    items: [
      { name_ja: '獺祭', expectedBrandIds: [887], main: true },
      { name_ja: '李白', expectedBrandIds: [846] },
    ],
  } as const

  it('has no single right sake when the bottles share the frame', () => {
    expect(judgeLanding(twoEqual, none)).toBe('right')
    expect(judgeLanding(twoEqual, one(887))).toBe('in_photo')
    expect(judgeLanding(twoEqual, list(887, 846))).toBe('in_list')
    expect(judgeLanding(twoEqual, one(1))).toBe('wrong')
  })

  it('is judged as the bottle in front when one clearly is', () => {
    expect(judgeLanding(oneInFront, one(887))).toBe('right')
    expect(judgeLanding(oneInFront, one(846))).toBe('in_photo')
    expect(judgeLanding(oneInFront, list(846, 1))).toBe('in_list')
    expect(judgeLanding(oneInFront, one(1))).toBe('wrong')
    expect(judgeLanding(oneInFront, none)).toBe('none')
  })

  it('is right with no match when the bottle in front is not in the catalogue', () => {
    const shochuInFront = {
      subject: 'several_bottles',
      items: [
        { name_ja: '相生焼酎', drink: 'shochu', expectedBrandIds: [], main: true },
        { name_ja: '李白', expectedBrandIds: [846] },
      ],
    } as const
    expect(judgeLanding(shochuInFront, none)).toBe('right')
    expect(judgeLanding(shochuInFront, one(846))).toBe('in_photo')
  })
})

describe('the ground-truth entry', () => {
  it('is a sake bottle unless it says otherwise, so entries written before the new kinds still parse', () => {
    const entry = GroundTruthEntrySchema.parse({ ...base, bottle: 'shichida', expectedBrandIds: [968] })
    expect(photoKind(entry)).toBe('sake_bottle')
    expect(canJudge(entry)).toBe(true)
  })

  it('names the kind from what is in the frame and what the drink is', () => {
    expect(photoKind({ drink: 'awamori' })).toBe('other_drink')
    expect(photoKind({ subject: 'one_bottle', drink: 'sake' })).toBe('sake_bottle')
    expect(photoKind({ subject: 'menu' })).toBe('menu')
    expect(photoKind({ subject: 'several_bottles' })).toBe('several_bottles')
  })

  it('cannot be judged without the rows or the items to judge against', () => {
    expect(canJudge({})).toBe(false)
    expect(canJudge({ drink: 'shochu' })).toBe(false)
    expect(canJudge({ subject: 'menu', items: [] })).toBe(false)
  })

  it('refuses a menu or a several-bottle photo that lists too little', () => {
    expect(GroundTruthEntrySchema.safeParse({ ...base, subject: 'menu' }).success).toBe(false)
    expect(
      GroundTruthEntrySchema.safeParse({
        ...base,
        subject: 'several_bottles',
        items: [{ name_ja: '獺祭', expectedBrandIds: [887] }],
      }).success,
    ).toBe(false)
  })

  it('refuses two main bottles, and a main item on a menu', () => {
    const items = [
      { name_ja: '獺祭', expectedBrandIds: [887], main: true },
      { name_ja: '李白', expectedBrandIds: [846], main: true },
    ]
    expect(GroundTruthEntrySchema.safeParse({ ...base, subject: 'several_bottles', items }).success).toBe(false)
    expect(GroundTruthEntrySchema.safeParse({ ...base, subject: 'menu', items: [items[0]] }).success).toBe(false)
  })

  it('refuses a bottle group on anything but a sake bottle, which keeps the pairs eval to sake', () => {
    const items = [{ name_ja: '七田', drink: 'shochu', expectedBrandIds: [] }]
    expect(GroundTruthEntrySchema.safeParse({ ...base, subject: 'menu', items, bottle: 'x' }).success).toBe(false)
    expect(
      GroundTruthEntrySchema.safeParse({ ...base, drink: 'shochu', expectedBrandIds: [], bottle: 'x' }).success,
    ).toBe(false)
  })

  it('refuses items on a photo of one bottle', () => {
    const items = [{ name_ja: '獺祭', expectedBrandIds: [887] }]
    expect(GroundTruthEntrySchema.safeParse({ ...base, items }).success).toBe(false)
  })
})

describe('a photo with no bottle in it', () => {
  const entry = { ...base, subject: 'no_bottle' as const }

  it('is its own kind, judged without anything listed', () => {
    expect(GroundTruthEntrySchema.safeParse(entry).success).toBe(true)
    expect(photoKind(entry)).toBe('no_bottle')
    expect(canJudge(entry)).toBe(true)
  })

  it('is right only when the scan shows no sake', () => {
    expect(judgeLanding(entry, none)).toBe('right')
    expect(judgeLanding(entry, one(968))).toBe('wrong')
    expect(judgeLanding(entry, list(968, 12))).toBe('wrong')
  })

  it('refuses items, since there is nothing in the frame to list', () => {
    expect(GroundTruthEntrySchema.safeParse({ ...entry, items: [{ name_ja: '七田', expectedBrandIds: [] }] }).success).toBe(
      false,
    )
  })
})
