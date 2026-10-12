/**
 * Kana to Latin letters, for comparing a name printed in kana with the
 * catalogue's romaji: a label's furigana くろかぶと or its katakana
 * ハナトモエ names a sake whose row is stored in kanji.
 *
 * Hepburn, and deliberately plain: the result is only ever fed to
 * `romajiKey`, which removes spacing and long-vowel spelling from both
 * sides, so `とう`, `tō` and `tou` all meet. Returns `null` for anything
 * that is not kana through and through.
 */

const MONOGRAPHS: Record<string, string> = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
  か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
  や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
  わ: 'wa', ゐ: 'i', ゑ: 'e', を: 'o', ん: 'n',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
  ゔ: 'vu',
  ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o',
}

const SMALL_Y: Record<string, string> = { ゃ: 'a', ゅ: 'u', ょ: 'o' }

/** し + ゃ is `sha`, not `shya`; the rest take a `y`. */
const PALATAL_STEMS: Record<string, string> = { shi: 'sh', chi: 'ch', ji: 'j' }

/** Katakana to hiragana: the two blocks sit 0x60 apart. */
function toHiragana(text: string): string {
  return text.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
}

export function kanaToRomaji(text: string): string | null {
  const kana = toHiragana(text.trim())
  if (kana.length === 0 || !/^[ぁ-ゖー・\s　]+$/.test(kana)) return null

  let out = ''
  let doubleNext = false
  const chars = Array.from(kana)
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]
    if (c === 'っ') {
      doubleNext = true
      continue
    }
    // The long-vowel mark, a separator dot or a space adds no letter.
    if (c === 'ー' || c === '・' || /\s|　/.test(c)) continue

    let syllable = MONOGRAPHS[c]
    if (syllable === undefined) return null
    const small = SMALL_Y[chars[i + 1]]
    if (small !== undefined && syllable.endsWith('i')) {
      syllable = (PALATAL_STEMS[syllable] ?? `${syllable.slice(0, -1)}y`) + small
      i++
    }
    if (doubleNext) {
      syllable = syllable[0] + syllable
      doubleNext = false
    }
    out += syllable
  }
  return out.length > 0 ? out : null
}
