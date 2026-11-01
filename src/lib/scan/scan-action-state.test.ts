import { describe, expect, it } from 'vitest'
import type { LabelScanExtraction } from '@/lib/schemas/label-scan-extraction'
import { landedSakeOf } from './scan-action-state'

const misread: LabelScanExtraction = {
  name_ja: '高',
  brewery_ja: '高清水酒造',
  confidence: 0.7,
  source: 'llm_extracted',
}

describe('landedSakeOf', () => {
  it('names the catalogue sake a brewery-only match landed on, not the misread brand', () => {
    expect(
      landedSakeOf({
        status: 'matched_brewery_only',
        extraction: misread,
        brandId: 7,
        sakeHref: '/en/sake/7',
        brandDivergence: { extracted: '高', stored: '高清水', storedRomaji: 'Takashimizu' },
        breweryRomaji: 'Akita Shurui',
      }),
    ).toEqual({ brandId: 7, sakeHref: '/en/sake/7', nameKanji: '高清水', nameRomaji: 'Takashimizu' })
  })

  it('names no sake for a read that found none', () => {
    expect(landedSakeOf({ status: 'no_match', extraction: misread, candidates: [] })).toBeNull()
  })
})
