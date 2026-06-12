import { describe, expect, it } from 'vitest'
import { expandKanaVariants } from './kana-variants'

describe('expandKanaVariants', () => {
  it('returns the verbatim form for pure kanji', () => {
    expect(expandKanaVariants('獺祭')).toEqual(['獺祭'])
  })

  it('returns the verbatim form for Latin', () => {
    expect(expandKanaVariants('UMAMI')).toEqual(['UMAMI'])
  })

  it('returns the verbatim form + katakana sibling for hiragana input', () => {
    // Matches the 169 hiragana-only Sakenowa brands — `ゆめほなみ`,
    // `あたごのまつ`, `まほろば`, etc. If the model returns the
    // hiragana form and Sakenowa happens to store the katakana,
    // the cross expansion still resolves.
    const variants = expandKanaVariants('うまみ')
    expect(variants).toContain('うまみ')
    expect(variants).toContain('ウマミ')
    expect(variants).toHaveLength(2)
  })

  it('returns the verbatim form + hiragana sibling for katakana input', () => {
    // Sakenowa has 35 katakana-only brands (`ラッキーキャッツ`, etc).
    const variants = expandKanaVariants('ウマミ')
    expect(variants).toContain('ウマミ')
    expect(variants).toContain('うまみ')
    expect(variants).toHaveLength(2)
  })

  it('expands the kana portion of a mixed kanji+hiragana string', () => {
    // The largest non-pure-kanji bucket: 653 mixed-script brands
    // like `風のささやき`, `北の誉`, `えぞ乃熊`. The kanji portion
    // stays put; the kana portion flips.
    const variants = expandKanaVariants('風のささやき')
    expect(variants).toContain('風のささやき')
    expect(variants).toContain('風ノササヤキ')
    expect(variants).toHaveLength(2)
  })

  it('expands the kana portion of a mixed kanji+katakana string', () => {
    const variants = expandKanaVariants('北ノ誉')
    expect(variants).toContain('北ノ誉')
    expect(variants).toContain('北の誉')
    expect(variants).toHaveLength(2)
  })

  it('does NOT confuse the long-vowel mark ー with anything', () => {
    // ー (0x30FC) is shared between katakana and hiragana — it
    // shouldn't be flipped on either pass. `ラッキー` stays as
    // `らっきー` (the ー survives), and likewise the reverse.
    const variants = expandKanaVariants('ラッキー')
    expect(variants).toContain('ラッキー')
    expect(variants).toContain('らっきー')
  })

  it('handles empty input safely', () => {
    expect(expandKanaVariants('')).toEqual([''])
  })
})
