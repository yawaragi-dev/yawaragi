import { beforeEach, describe, expect, it } from 'vitest'
import {
  appendMatchToHistory,
  clearScanHistory,
  getConsensusFromHistory,
  type ScanHistoryEntry,
} from './scan-history'

function entry(brandId: number, suffix = ''): ScanHistoryEntry {
  return {
    brandId,
    sakeHref: `/en/sake/${brandId}${suffix}`,
    nameKanji: `テスト${brandId}`,
    tMs: Date.now(),
  }
}

describe('scan-history', () => {
  beforeEach(() => {
    // sessionStorage persists across tests in the same jsdom/happy-dom
    // instance — clear between cases so each starts from a known empty
    // state.
    window.sessionStorage.clear()
  })

  describe('getConsensusFromHistory', () => {
    it('returns null when history is empty', () => {
      expect(getConsensusFromHistory()).toBeNull()
    })

    it('returns null when history has only one entry (a single scan is not a consensus)', () => {
      appendMatchToHistory(entry(1009))
      expect(getConsensusFromHistory()).toBeNull()
    })

    it('returns null when two entries are tied (1 of 2 is not a majority)', () => {
      appendMatchToHistory(entry(1009))
      appendMatchToHistory(entry(2000))
      expect(getConsensusFromHistory()).toBeNull()
    })

    it('returns the brand when 2 of 2 entries agree (unanimous)', () => {
      appendMatchToHistory(entry(1009))
      appendMatchToHistory(entry(1009))
      const consensus = getConsensusFromHistory()
      expect(consensus).not.toBeNull()
      expect(consensus?.brandId).toBe(1009)
      expect(consensus?.votes).toBe(2)
      expect(consensus?.total).toBe(2)
    })

    it('returns the strict-majority brand from a mixed history (3 of 5)', () => {
      appendMatchToHistory(entry(1009))
      appendMatchToHistory(entry(2000))
      appendMatchToHistory(entry(1009))
      appendMatchToHistory(entry(3000))
      appendMatchToHistory(entry(1009))
      const consensus = getConsensusFromHistory()
      expect(consensus?.brandId).toBe(1009)
      expect(consensus?.votes).toBe(3)
      expect(consensus?.total).toBe(5)
    })

    it('returns null when the leading brand has a plurality but not a majority (2 of 5)', () => {
      // 2 × 1009, 2 × 2000, 1 × 3000 — leader has only 2/5 = 40%, no
      // strict majority. We DON'T want to surface a "this looks like"
      // card unless more than half of the recent scans agree.
      appendMatchToHistory(entry(1009))
      appendMatchToHistory(entry(2000))
      appendMatchToHistory(entry(1009))
      appendMatchToHistory(entry(2000))
      appendMatchToHistory(entry(3000))
      expect(getConsensusFromHistory()).toBeNull()
    })

    it('caps the history at 10 entries (oldest dropped)', () => {
      // Push 12 entries, all brand 1009. The cap should clip to the
      // last 10; consensus should still return 1009.
      for (let i = 0; i < 12; i++) appendMatchToHistory(entry(1009))
      const consensus = getConsensusFromHistory()
      expect(consensus?.total).toBe(10)
      expect(consensus?.votes).toBe(10)
    })

    it('the cap actually drops the oldest — early entries cannot win after eviction', () => {
      // 5 × old brand 1009, then 6 × new brand 2000. After 11 total,
      // the cap drops one 1009 entry, leaving 4 × 1009 + 6 × 2000.
      // Consensus should be 2000 (6 of 10).
      for (let i = 0; i < 5; i++) appendMatchToHistory(entry(1009))
      for (let i = 0; i < 6; i++) appendMatchToHistory(entry(2000))
      const consensus = getConsensusFromHistory()
      expect(consensus?.brandId).toBe(2000)
      expect(consensus?.votes).toBe(6)
      expect(consensus?.total).toBe(10)
    })

    it('uses the latest entry for the winning brand to source nameKanji + sakeHref', () => {
      appendMatchToHistory({ ...entry(1009), nameKanji: '蔵玉', sakeHref: '/en/sake/1009' })
      appendMatchToHistory(entry(2000))
      appendMatchToHistory({ ...entry(1009), nameKanji: '蔵王', sakeHref: '/en/sake/1009?refreshed=1' })
      const consensus = getConsensusFromHistory()
      // The latest 1009 entry had nameKanji '蔵王' and the refreshed
      // href — those win, not the older '蔵玉' / vanilla href.
      expect(consensus?.nameKanji).toBe('蔵王')
      expect(consensus?.sakeHref).toBe('/en/sake/1009?refreshed=1')
    })
  })

  describe('clearScanHistory', () => {
    it('wipes the history', () => {
      appendMatchToHistory(entry(1009))
      appendMatchToHistory(entry(1009))
      expect(getConsensusFromHistory()).not.toBeNull()
      clearScanHistory()
      expect(getConsensusFromHistory()).toBeNull()
    })
  })
})
