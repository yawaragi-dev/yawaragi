import { describe, expect, it } from 'vitest'
import type { PhotoItem } from '../label-scan-jp/schemas'
import { judgeList } from './judge'

const ITEMS: PhotoItem[] = [
  { name_ja: '秋鹿', expectedBrandIds: [10] },
  { name_ja: '神亀', expectedBrandIds: [20, 21] },
  { name_ja: '房島屋', expectedBrandIds: [] },
  { name_ja: '瑞泉', drink: 'awamori', expectedBrandIds: [30] },
  { unreadable: true, expectedBrandIds: [] },
]

describe('judging a list read against the photo’s items', () => {
  it('counts a catalogue sake found when any of its rows is shown', () => {
    expect(judgeList(ITEMS, [10, 21])).toMatchObject({ findable: 2, found: 2, missedItems: [], wrongRows: [] })
  })

  it('names the catalogue sakes the read did not show', () => {
    expect(judgeList(ITEMS, [10])).toMatchObject({ found: 1, missedItems: ['神亀'] })
  })

  it('calls a row for a sake that is not on the photo wrong', () => {
    expect(judgeList(ITEMS, [10, 99]).wrongRows).toEqual([99])
  })

  it('keeps a non-sake item shown as a sake apart from a wrong row', () => {
    expect(judgeList(ITEMS, [30])).toMatchObject({ wrongRows: [], notSakeShownAsSake: [30] })
  })
})
