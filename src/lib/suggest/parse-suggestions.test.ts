import { describe, expect, it } from 'vitest'
import { parseSuggestionsFromText } from './parse-suggestions'

const validRow = {
  brandId: { source: 'sakenowa', value: 42 },
  name_ja: { source: 'sakenowa', value: '獺祭' },
  name_romaji: { source: 'sakenowa', value: 'Dassai' },
  reason: { source: 'llm_inferred', value: 'A parallel aromatic Junmai Daiginjo.' },
}

describe('parseSuggestionsFromText', () => {
  it('parses a bare JSON array of suggestions', () => {
    const result = parseSuggestionsFromText(JSON.stringify([validRow, validRow]))
    expect(result).toHaveLength(2)
    expect(result[0].brandId.value).toBe(42)
  })

  it('parses a { suggestions: [...] } envelope', () => {
    const result = parseSuggestionsFromText(
      JSON.stringify({ suggestions: [validRow] }),
    )
    expect(result).toHaveLength(1)
  })

  it('unwraps a ```json fenced block', () => {
    const fenced = '```json\n' + JSON.stringify([validRow]) + '\n```'
    const result = parseSuggestionsFromText(fenced)
    expect(result).toHaveLength(1)
  })

  it('extracts an array from prose that starts with a leading sentence', () => {
    const noisy =
      'Here are 3 sakes similar to your seed:\n\n' + JSON.stringify([validRow])
    const result = parseSuggestionsFromText(noisy)
    expect(result).toHaveLength(1)
  })

  it('drops a malformed row but keeps the good ones (honest partial result)', () => {
    // Row 1 is valid; row 2 is missing `name_romaji` — schema rejects it.
    const { name_romaji: _dropped, ...badRow } = validRow
    void _dropped
    const result = parseSuggestionsFromText(JSON.stringify([validRow, badRow]))
    expect(result).toHaveLength(1)
    expect(result[0].name_romaji.value).toBe('Dassai')
  })

  it('returns [] for an empty array (honest no-match path)', () => {
    expect(parseSuggestionsFromText('[]')).toEqual([])
  })

  it('returns [] on total parse failure (never throws)', () => {
    expect(parseSuggestionsFromText('this is not JSON at all')).toEqual([])
  })

  it('caps at 6 suggestions (the card layout upper bound)', () => {
    const eight = Array.from({ length: 8 }, () => validRow)
    const result = parseSuggestionsFromText(JSON.stringify(eight))
    expect(result).toHaveLength(6)
  })
})
