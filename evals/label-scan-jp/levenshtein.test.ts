import { describe, expect, it } from 'vitest'
import { charAccuracy, levenshtein } from './levenshtein'

// The metric math is the ONLY part of the label-scan eval that CI runs
// (`pnpm test`). The eval runner itself (`scripts/eval-label-scan-jp.ts`)
// is informational and never gated. These tests pin the arithmetic so a
// refactor of the DP loop can't silently skew every provider's score.

describe('levenshtein — the edit distance a scan score is built on', () => {
  it('reports zero edits for identical strings', () => {
    expect(levenshtein('', '')).toBe(0)
    expect(levenshtein('獺祭', '獺祭')).toBe(0)
    expect(levenshtein('Tanigawa Dake', 'Tanigawa Dake')).toBe(0)
  })

  it('counts every character of a string as an edit against the empty string', () => {
    expect(levenshtein('', '獺祭')).toBe(2)
    expect(levenshtein('abc', '')).toBe(3)
  })

  it('counts a single substitution as one edit', () => {
    expect(levenshtein('八海山', '八海川')).toBe(1)
  })

  it('counts a single deletion (dropped kanji) as one edit', () => {
    // The model returned only the first kanji of a two-kanji brand.
    expect(levenshtein('獺祭', '獺')).toBe(1)
  })

  it('matches the textbook kitten→sitting distance of 3', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3)
  })

  it('is symmetric — argument order does not change the distance', () => {
    expect(levenshtein('獺祭 純米大吟醸', '獺祭')).toBe(levenshtein('獺祭', '獺祭 純米大吟醸'))
  })

  it('treats one visual kanji as one token, not two UTF-16 code units', () => {
    // 𠮷 (U+20BB7, "tsuchiyoshi") is an astral-plane CJK char that occupies
    // two UTF-16 code units. A naive `.length`-based distance against 吉
    // would report 2 (delete-two, insert-one style); codepoint tokenisation
    // reports 1 substitution.
    expect(levenshtein('𠮷', '吉')).toBe(1)
    expect(levenshtein('𠮷野', '吉野')).toBe(1)
  })
})

describe('charAccuracy — the normalised per-field score reported in the table', () => {
  it('scores a perfect extraction 1.0', () => {
    expect(charAccuracy('獺祭', '獺祭')).toBe(1)
  })

  it('scores two empty strings 1.0 (nothing to get wrong)', () => {
    expect(charAccuracy('', '')).toBe(1)
  })

  it('scores a one-of-two-kanji miss at 0.5', () => {
    expect(charAccuracy('獺祭', '獺')).toBe(0.5)
  })

  it('never drops below 0 even when the model hallucinates a much longer string', () => {
    // Model returned the whole label incl. SKU modifiers instead of the
    // stripped brand — long, mostly-wrong. Score floors at 0, never negative.
    const score = charAccuracy('獺祭', '純米大吟醸 磨き二割三分')
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThan(0.5)
  })

  it('scores a completely different equal-length string at 0', () => {
    expect(charAccuracy('abc', 'xyz')).toBe(0)
  })
})
