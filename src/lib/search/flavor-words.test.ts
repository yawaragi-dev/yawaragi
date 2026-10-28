import { describe, expect, it } from 'vitest'
import { FLAVOR_WORDS, matchFlavorWord, normalizeFlavorQuery } from '@/lib/search/flavor-words'

describe('matchFlavorWord', () => {
  it('finds the Sakenowa tag for a flavor word typed in English', () => {
    expect(matchFlavorWord('grapefruit', 'en')).toEqual({
      tags: [{ tagId: 109, kanji: 'グレープフルーツ' }],
      word: 'grapefruit',
      source: 'manual_curation',
    })
  })

  it('finds it for the German word too, whatever the page language', () => {
    expect(matchFlavorWord('Melone', 'en')?.tags).toEqual([{ tagId: 42, kanji: 'メロン' }])
    expect(matchFlavorWord('melon', 'de')?.tags).toEqual([{ tagId: 42, kanji: 'メロン' }])
  })

  it('names the tag in the page language, whichever language was typed', () => {
    expect(matchFlavorWord('Apfel', 'en')?.word).toBe('apple')
    expect(matchFlavorWord('apple', 'de')?.word).toBe('Apfel')
    // A synonym is shown as the entry's main word.
    expect(matchFlavorWord('citrusy', 'en')?.word).toBe('citrus')
  })

  it('ignores case, surrounding space, quotes and German spelling variants', () => {
    expect(matchFlavorWord('  GRAPEFRUIT ', 'en')?.tags[0].tagId).toBe(109)
    expect(matchFlavorWord('“grapefruit”', 'en')?.tags[0].tagId).toBe(109)
    expect(matchFlavorWord('süß', 'de')?.tags[0].tagId).toBe(12)
    expect(matchFlavorWord('süss', 'de')?.tags[0].tagId).toBe(12)
    expect(matchFlavorWord('sweet-and-sour', 'en')?.tags[0].tagId).toBe(63)
  })

  it('matches the whole query only, so a sake name holding a flavor word is still a name search', () => {
    expect(matchFlavorWord('grapefruit sake', 'en')).toBeNull()
    expect(matchFlavorWord('grape', 'en')?.tags[0].tagId).toBe(89) // ブドウ, not グレープフルーツ
    expect(matchFlavorWord('dassai', 'en')).toBeNull()
    expect(matchFlavorWord('', 'en')).toBeNull()
  })

  it('reads one word as every spelling Sakenowa has for it', () => {
    // キャラメル and カラメル are one flavor written two ways.
    expect(matchFlavorWord('caramel', 'en')?.tags.map((t) => t.tagId)).toEqual([29, 139])
  })

  it('does not answer to the kanji itself, which is a name search (桜 is in many sake names)', () => {
    expect(matchFlavorWord('桜', 'en')).toBeNull()
  })

  it('knows both words the empty-field hint offers, in both languages', () => {
    for (const word of ['grapefruit', 'melon', 'Grapefruit', 'Melone']) {
      expect(matchFlavorWord(word, 'en'), word).not.toBeNull()
    }
  })
})

describe('FLAVOR_WORDS', () => {
  it('gives every typed word exactly one meaning across both languages', () => {
    const seen = new Map<string, number>()
    FLAVOR_WORDS.forEach((entry, index) => {
      for (const term of new Set([...entry.en, ...entry.de].map(normalizeFlavorQuery))) {
        expect(seen.get(term), `"${term}" is in entries ${seen.get(term)} and ${index}`).toBeUndefined()
        seen.set(term, index)
      }
    })
  })

  it('spells each Sakenowa tag the same way wherever it appears', () => {
    const kanjiById = new Map<number, string>()
    for (const entry of FLAVOR_WORDS) {
      for (const [id, kanji] of entry.tags) {
        expect(kanjiById.get(id) ?? kanji, `tag ${id}`).toBe(kanji)
        kanjiById.set(id, kanji)
      }
    }
  })

  it('has a main word in each language for every entry', () => {
    for (const entry of FLAVOR_WORDS) {
      expect(entry.en.length, entry.tags[0][1]).toBeGreaterThan(0)
      expect(entry.de.length, entry.tags[0][1]).toBeGreaterThan(0)
    }
  })
})
