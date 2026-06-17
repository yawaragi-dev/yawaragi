/**
 * Hiragana ↔ Katakana script-cross expansion.
 *
 * Sakenowa stores brand and brewery names in whatever script the
 * publisher used. As of 2026-06-12 a count of the upstream `/brands`
 * payload reveals ~314 brands (~10 %) with names entirely in
 * non-kanji scripts:
 *   - 169 brands hiragana-only (e.g. `ゆめほなみ`, `あたごのまつ`)
 *   - 35 brands katakana-only (e.g. `ラッキーキャッツ`)
 *   - 110 brands Latin-only (e.g. `Shangri-la`, `I LOVE SUSHI`)
 *
 * Plus another 653 mixed-script brands (`風のささやき`, `えぞ乃熊`)
 * where part of the name is kana.
 *
 * The kana → kana cross is a deterministic 1:1 character mapping
 * (Unicode offset 0x60 between the hiragana 0x3041–0x3096 block and
 * the katakana 0x30A1–0x30F6 block for the corresponding glyphs).
 * Applied per character, so mixed kanji-and-kana strings get the
 * kana portion flipped while the kanji portion stays put — exactly
 * what we want when the model returns one kana form and Sakenowa
 * stores the other.
 *
 * NOT handled here: Latin (`I LOVE SUSHI`) → Japanese script
 * matching. That requires the LLM-derived `name_romaji` field or
 * Sakenowa's published `name` field as a separate join key. Future
 * work, documented in obstacles doc §22.
 */

const HIRAGANA_TO_KATAKANA_OFFSET = 0x60

function isHiraganaChar(code: number): boolean {
  // Standard hiragana block: ぁ (0x3041) through ゖ (0x3096). We
  // deliberately skip the 0x3097-0x309F tail (combining marks, the
  // hiragana iteration mark ゝ etc.) where the offset doesn't map
  // cleanly to a katakana sibling.
  return code >= 0x3041 && code <= 0x3096
}

function isKatakanaChar(code: number): boolean {
  // Standard katakana block: ァ (0x30A1) through ヶ (0x30F6).
  // Skip the long-vowel mark ー (0x30FC, doesn't have a hiragana
  // equivalent — it stays "ー" in both scripts).
  return code >= 0x30A1 && code <= 0x30F6
}

function hiraganaToKatakana(text: string): string {
  return Array.from(text)
    .map((c) => {
      const code = c.charCodeAt(0)
      return isHiraganaChar(code) ? String.fromCharCode(code + HIRAGANA_TO_KATAKANA_OFFSET) : c
    })
    .join('')
}

function katakanaToHiragana(text: string): string {
  return Array.from(text)
    .map((c) => {
      const code = c.charCodeAt(0)
      return isKatakanaChar(code) ? String.fromCharCode(code - HIRAGANA_TO_KATAKANA_OFFSET) : c
    })
    .join('')
}

/**
 * Returns the verbatim input plus cross-script siblings:
 *   - If the input contains hiragana, add the katakana-form sibling.
 *   - If the input contains katakana, add the hiragana-form sibling.
 *   - Pure kanji / Latin / empty input → returns `[text]` verbatim.
 *
 * Deduped via Set so a string with no kana characters never
 * produces a meaningless duplicate.
 */
export function expandKanaVariants(text: string): string[] {
  if (text.length === 0) return [text]

  const variants = new Set<string>([text])
  const codes = Array.from(text).map((c) => c.charCodeAt(0))

  if (codes.some(isHiraganaChar)) {
    variants.add(hiraganaToKatakana(text))
  }
  if (codes.some(isKatakanaChar)) {
    variants.add(katakanaToHiragana(text))
  }
  return [...variants]
}
