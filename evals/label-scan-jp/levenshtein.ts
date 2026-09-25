/**
 * Phase 3 / S5 (#110) — character-level metric math for the label-scan eval.
 *
 * Two pure functions, deliberately dependency-free so the unit test
 * (`levenshtein.test.ts`) can pin the arithmetic without a single mock.
 * Nothing here imports `server-only`, the AI SDK, or the vision seam — the
 * metric is the one part of the harness that CI actually runs (`pnpm test`),
 * so it must load in a plain vitest worker.
 *
 * # Why codepoint-level, not UTF-16 code-unit-level
 *
 * A JavaScript string iterated with `.length` / `s[i]` counts UTF-16 code
 * units, so an astral-plane character (some rare kanji live in CJK Ext-B,
 * U+20000+) counts as TWO units and would inflate the distance. The eval
 * compares Japanese script (`name_ja`, `brewery_ja`), so we tokenise with
 * `Array.from` — which iterates Unicode codepoints — and compute the edit
 * distance over the codepoint arrays. One visual kanji = one token.
 */

/**
 * Classic Levenshtein edit distance (insertions + deletions +
 * substitutions, unit cost each) between two strings, measured in Unicode
 * codepoints. Symmetric: `levenshtein(a, b) === levenshtein(b, a)`.
 *
 * Two-row dynamic-programming implementation — O(a·b) time, O(min) space.
 */
export function levenshtein(a: string, b: string): number {
  const s = Array.from(a)
  const t = Array.from(b)

  if (s.length === 0) return t.length
  if (t.length === 0) return s.length

  // `prev[j]` = edit distance between s[0..i-1] and t[0..j-1].
  const prev = new Array<number>(t.length + 1)
  for (let j = 0; j <= t.length; j++) prev[j] = j

  const curr = new Array<number>(t.length + 1)
  for (let i = 1; i <= s.length; i++) {
    curr[0] = i
    for (let j = 1; j <= t.length; j++) {
      const substitutionCost = s[i - 1] === t[j - 1] ? 0 : 1
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + substitutionCost, // substitution / match
      )
    }
    // Copy curr → prev for the next row without reallocating.
    for (let j = 0; j <= t.length; j++) prev[j] = curr[j]
  }

  return prev[t.length]
}

/**
 * Character-level accuracy in `[0, 1]`:
 *
 *   accuracy = 1 - levenshtein(expected, actual) / max(len(expected), len(actual))
 *
 * - Two empty strings score `1` (nothing to get wrong).
 * - A completely different string of equal-or-greater length scores `0`.
 * - A one-character miss on a two-character field (獺祭 → 獺) scores `0.5`.
 *
 * Normalising by the longer of the two lengths keeps the score in range even
 * when the model hallucinates a much longer string than the ground truth (a
 * common failure mode — the model returns the full label including SKU
 * modifiers instead of the stripped brand). Length is measured in codepoints
 * to match `levenshtein`.
 */
export function charAccuracy(expected: string, actual: string): number {
  const expectedLen = Array.from(expected).length
  const actualLen = Array.from(actual).length
  const denom = Math.max(expectedLen, actualLen)
  if (denom === 0) return 1
  const distance = levenshtein(expected, actual)
  return Math.max(0, 1 - distance / denom)
}
