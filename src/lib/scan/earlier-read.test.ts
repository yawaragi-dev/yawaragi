import { describe, expect, it } from 'vitest'
import type { LabelScanExtraction } from '@/lib/schemas/label-scan-extraction'
import { earlierReadOf } from './earlier-read'
import type { ScanActionState } from './scan-action-state'

const extraction = (confidence: number): LabelScanExtraction => ({
  name_ja: '人気一',
  brewery_ja: '人気酒造',
  other_names: ['NINKI-ICHI'],
  confidence,
  source: 'llm_extracted',
})

const matched = (confidence: number): ScanActionState => ({
  status: 'matched',
  extraction: extraction(confidence),
  brandId: 191,
  sakeHref: '/en/sake/191',
  sakeRomaji: 'Ninki Ichi',
  breweryRomaji: 'Ninki Shuzo',
  flavorChart: null,
  otherCandidates: [],
})

describe('what the next photo is read together with', () => {
  it('is the read of a scan that did not settle on one sake', () => {
    const read = earlierReadOf({ status: 'no_match', extraction: extraction(0.7), candidates: [] })
    expect(read).toEqual({ name_ja: '人気一', brewery_ja: '人気酒造', other_names: ['NINKI-ICHI'], confidence: 0.7 })
  })

  it('is kept after a best guess, which the visitor may be checking', () => {
    expect(earlierReadOf(matched(0.7))?.name_ja).toBe('人気一')
  })

  it('is nothing after a sure match: that bottle is done', () => {
    expect(earlierReadOf(matched(0.9))).toBeNull()
  })

  it('is nothing when the last scan read nothing', () => {
    expect(earlierReadOf({ status: 'idle' })).toBeNull()
    expect(earlierReadOf({ status: 'extraction_failed', reason: 'AI_RetryError' })).toBeNull()
    expect(earlierReadOf({ status: 'rate_limited', retryAfterSec: 60 })).toBeNull()
  })
})
