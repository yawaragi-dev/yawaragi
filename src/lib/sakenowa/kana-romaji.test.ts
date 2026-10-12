import { describe, expect, it } from 'vitest'
import { kanaToRomaji } from './kana-romaji'

describe('kanaToRomaji', () => {
  it('reads a furigana beside brush kanji: くろかぶと is kurokabuto', () => {
    expect(kanaToRomaji('くろかぶと')).toBe('kurokabuto')
  })

  it('reads katakana brand marks: ハナトモエ, ニンキイチ, ヤマガタマサムネ', () => {
    expect(kanaToRomaji('ハナトモエ')).toBe('hanatomoe')
    expect(kanaToRomaji('ニンキイチ')).toBe('ninkiichi')
    expect(kanaToRomaji('ヤマガタマサムネ')).toBe('yamagatamasamune')
  })

  it('handles small ya-yu-yo, the doubling っ and the long mark', () => {
    expect(kanaToRomaji('がりゅうばい')).toBe('garyuubai')
    expect(kanaToRomaji('しゃんぐりら')).toBe('shangurira')
    expect(kanaToRomaji('いっぽん')).toBe('ippon')
    expect(kanaToRomaji('ゴールド')).toBe('gorudo')
  })

  it('returns null for anything that is not kana through and through', () => {
    expect(kanaToRomaji('花巴')).toBeNull()
    expect(kanaToRomaji('澤の花')).toBeNull()
    expect(kanaToRomaji('HANATOMOE')).toBeNull()
    expect(kanaToRomaji('')).toBeNull()
  })
})
