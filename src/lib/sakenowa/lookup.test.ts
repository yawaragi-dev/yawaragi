import { describe, expect, it } from 'vitest'
import { expandLatinBrandVariants } from './lookup'

/**
 * Pure-function unit tests for the Latin variant expansion used by the
 * fifth-pass Sakenowa lookup. The lookup chain as a whole is exercised
 * end-to-end against testcontainers in `lookup.integration.test.ts`;
 * these tests pin the per-input transform contract so a regression in
 * the variant set is caught fast without spinning Postgres.
 */
describe('expandLatinBrandVariants', () => {
  it('returns an empty list for empty / whitespace-only input', () => {
    expect(expandLatinBrandVariants('')).toEqual([])
    expect(expandLatinBrandVariants('   ')).toEqual([])
  })

  it('lowercases the verbatim input', () => {
    expect(expandLatinBrandVariants('UMAMI')).toEqual(['umami'])
  })

  it('strips the first word as a second variant for multi-word brands (≥ 4-char floor)', () => {
    // "Kizakura Perle" → also try "Kizakura" alone. The Perle is a
    // sub-line modifier the catalogue does not track separately.
    expect(expandLatinBrandVariants('Kizakura Perle')).toEqual(
      expect.arrayContaining(['kizakura perle', 'kizakura']),
    )
  })

  it('skips the first-word-strip when the first word is shorter than 4 chars', () => {
    // 4-char floor prevents `"Big River" → "Big"` from polluting candidates.
    const out = expandLatinBrandVariants('Big River')
    expect(out).not.toContain('big')
    expect(out).toContain('big river')
  })

  it('adds a space-stripped variant when input contains a space', () => {
    // The #121 ingest pipeline writes single-word camel Latin to
    // `name_romaji` ("Tanigawadake", "Kawatsuru"), so a natural
    // "Tanigawa Dake" extraction must squash to match.
    expect(expandLatinBrandVariants('Tanigawa Dake')).toEqual(
      expect.arrayContaining(['tanigawa dake', 'tanigawa', 'tanigawadake']),
    )
  })

  it('does not duplicate the space-stripped form when input has no space', () => {
    // Already-spaceless input is covered by the verbatim variant alone.
    expect(expandLatinBrandVariants('Tanigawadake')).toEqual(['tanigawadake'])
  })

  // Grade-token blocklist regression coverage. The blocklist is the
  // load-bearing defence against Haiku returning a sake descriptor
  // (`"JUNMAI TARU SAKE"`) as the brand and the bare descriptor
  // first-word-strip matching an unrelated Sakenowa brand whose Latin
  // name happens to start with that descriptor (Kiku-Masamune,
  // 2026-06-14). See SAKE_GRADE_TOKENS in lookup.ts for the full list.

  it('suppresses the first-word-strip when the first word is a sake grade token (junmai)', () => {
    const out = expandLatinBrandVariants('JUNMAI TARU SAKE')
    expect(out).not.toContain('junmai')
    expect(out).toContain('junmai taru sake')
    expect(out).toContain('junmaitarusake')
  })

  it('suppresses the first-word-strip for daiginjo / ginjo / honjozo / kimoto / yamahai / taru', () => {
    // Sample across the blocklist to catch accidental token removal.
    expect(expandLatinBrandVariants('Daiginjo Premium')).not.toContain('daiginjo')
    expect(expandLatinBrandVariants('Ginjo Style')).not.toContain('ginjo')
    expect(expandLatinBrandVariants('Honjozo Classic')).not.toContain('honjozo')
    expect(expandLatinBrandVariants('Kimoto Aged')).not.toContain('kimoto')
    expect(expandLatinBrandVariants('Yamahai Junmai')).not.toContain('yamahai')
    expect(expandLatinBrandVariants('Taru Sake')).not.toContain('taru')
  })

  it('still strips non-blocklist first words even when later words look like descriptors', () => {
    // "Kizakura Junmai" — `Junmai` is in the middle, not the first
    // word. The first-word `Kizakura` must still be added as a variant
    // (the blocklist only inspects position 0).
    const out = expandLatinBrandVariants('Kizakura Junmai')
    expect(out).toContain('kizakura')
  })

  it('is case-insensitive on the blocklist check', () => {
    // Same `junmai` filter must fire whether the model returns
    // upper-, lower-, or mixed-case.
    expect(expandLatinBrandVariants('junmai Taru Sake')).not.toContain('junmai')
    expect(expandLatinBrandVariants('Junmai Taru Sake')).not.toContain('junmai')
    expect(expandLatinBrandVariants('JuNmAi Taru Sake')).not.toContain('junmai')
  })

  it('emits all three forms for a normal multi-word brand (verbatim, first-word, space-stripped)', () => {
    // Sanity check that the three transforms compose for a non-grade
    // input. Order is not asserted (Set-backed); presence is.
    const out = expandLatinBrandVariants('Kizakura Perle')
    expect(new Set(out)).toEqual(new Set(['kizakura perle', 'kizakura', 'kizakuraperle']))
  })
})
