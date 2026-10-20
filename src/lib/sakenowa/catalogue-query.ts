/* Shared by the server search and the suggestion field in the browser. */

/**
 * Shortest query §8 will run.
 *
 * One character of kanji is a real query — 山 is a word — but one Latin letter
 * is not: "a" matches a large fraction of the romaji column and tells the
 * visitor nothing. So the floor is one character of non-ASCII input and two of
 * ASCII. Below it the page renders its empty state instead of a list.
 */
export function isCatalogueQuerySpecific(query: string): boolean {
  const trimmed = query.trim()
  if (trimmed.length === 0) return false
  // Anything outside printable ASCII is kanji, kana or a macron'd vowel — any
  // one of those is specific enough on its own.
  if (/[^\x20-\x7e]/.test(trimmed)) return true
  return trimmed.length >= 2
}
