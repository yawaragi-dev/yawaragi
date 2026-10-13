import { describe, expect, it } from 'vitest'
import { looseRomajiKey, romajiKey } from './romaji-key'

const same = (...spellings: string[]) => new Set(spellings.map(romajiKey)).size === 1

describe('romajiKey', () => {
  it('ignores spacing, hyphens and case: Sawa no Hana, sawanohana, SAWA-NO-HANA', () => {
    expect(same('Sawa no Hana', 'sawanohana', 'SAWA-NO-HANA', "Sawa'no Hana")).toBe(true)
  })

  it('ignores how a long vowel is written: Fudoh, Fudō, Fudou, Fudo', () => {
    expect(same('Fudoh', 'Fudō', 'Fudou', 'Fudo', 'FUDÔ')).toBe(true)
    expect(same('Garyuubai', 'GARYUBAI', 'Garyūbai')).toBe(true)
    expect(same('Niigata', 'Nigata')).toBe(true)
  })

  it('keeps an h that opens the next syllable: Sohomare is not Soomare', () => {
    expect(same('Sohomare', 'Souhomare', 'Sōhomare')).toBe(true)
    expect(romajiKey('Tamanohikari')).toBe('tamanohikari')
    expect(same('Kohaku', 'Koaku')).toBe(false)
  })

  it('collapses a run of long vowels whole: Hououbiden, Hoo Biden', () => {
    expect(same('Hououbiden', 'Hoo Biden', 'Hōō Biden')).toBe(true)
  })

  it('reads Kunrei and Nihon-shiki spellings as Hepburn', () => {
    expect(same('Shichiken', 'Sitiken')).toBe(true)
    expect(same('Tsuru', 'Turu')).toBe(true)
    expect(same('Fuji', 'Huzi')).toBe(true)
    expect(same('Shochu', 'Syotyu', 'Shōchū')).toBe(true)
    expect(same('Junmai', 'Zyunmai', 'Jyunmai')).toBe(true)
    expect(same('Mizubasho', 'Midubasyo')).toBe(true)
  })

  it('leaves Hepburn syllables that merely contain a Kunrei one alone: shu, chu, tsu', () => {
    expect(romajiKey('Shuzo')).toBe('shuzo')
    expect(romajiKey('Chugoku')).toBe('chugoku')
    expect(romajiKey('Matsu')).toBe('matsu')
  })

  it('ignores m for n before b, p, m: Namba and Nanba, gemmai and genmai', () => {
    expect(same('Namba', 'Nanba')).toBe(true)
    expect(same('gemmai', 'genmai')).toBe(true)
    expect(same('Kampai', 'Kanpai')).toBe(true)
  })

  it('ignores l for r, old ye and kwa, tch for cch', () => {
    expect(same('Rihaku', 'Lihaku')).toBe(true)
    expect(same('Yebisu', 'Ebisu')).toBe(true)
    expect(same('Kwannon', 'Kannon')).toBe(true)
    expect(same('Matcha', 'Maccha')).toBe(true)
  })

  it('keeps different names different', () => {
    expect(same('Sanwa', 'Miwa')).toBe(false)
    expect(same('Hokushika', 'Hokusetsu')).toBe(false)
    expect(same('Hokushika', 'Hakushika')).toBe(false)
    expect(same('Fukuju', 'Fukujukai')).toBe(false)
    expect(same('Kame', 'Game')).toBe(false)
  })

  it('does not treat a different reading as a spelling: Kitashika is not Hokushika', () => {
    expect(same('Kitashika', 'Hokushika')).toBe(false)
  })
})

describe('looseRomajiKey', () => {
  it('lets a voiced compound meet its unvoiced spelling: Taruzake and Tarusake', () => {
    expect(looseRomajiKey('Yoshinosugi no Taruzake')).toBe(looseRomajiKey('Yoshino Sugi no Tarusake'))
    expect(looseRomajiKey('Sakagura')).toBe(looseRomajiKey('Sakakura'))
  })

  it('is looser than the strict key, which is why it is never evidence alone', () => {
    expect(looseRomajiKey('Kame')).toBe(looseRomajiKey('Game'))
    expect(romajiKey('Kame')).not.toBe(romajiKey('Game'))
  })

  it('still keeps unrelated names apart', () => {
    expect(looseRomajiKey('Sanwa')).not.toBe(looseRomajiKey('Miwa'))
  })
})
