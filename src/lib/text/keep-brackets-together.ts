/** U+2060 WORD JOINER: invisible, and no line break may fall on it. */
const WORD_JOINER = '⁠'

/**
 * Keeps a bracketed Japanese term on one line: "kunshu (薫酒)" must never wrap
 * as "kunshu (薫" / "酒)" (design v1.8, Q6). Browsers may break between any
 * two kanji, so a word joiner goes between each pair of characters inside the
 * brackets; the brackets themselves already cling to their neighbours.
 */
export function keepBracketsTogether(text: string): string {
  return text.replace(/\(([^()]+)\)/g, (_, inner: string) => `(${[...inner].join(WORD_JOINER)})`)
}
