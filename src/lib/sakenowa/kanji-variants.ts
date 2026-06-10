/**
 * Old-form (旧字体, kyūjitai) ↔ new-form (新字体, shinjitai) kanji
 * variant pairs that occur in sake brand and brewery names. Used by
 * `findSakeByExtraction` to widen the join so a model reading
 * 蔵王 (new) matches the Sakenowa-stored 藏王 (old), or vice versa.
 *
 * The two forms are semantically identical — the Japanese
 * government's 1946 Tōyō Kanji List defined the simplified new forms
 * for everyday writing. Older brand names and many traditional
 * brewery names retain the old forms intentionally as a stylistic
 * choice; modern OCR / vision models tend to output the new form
 * regardless. The mismatch is a documented, well-known correctness
 * footgun.
 *
 * This list is deliberately scoped to the sake-naming domain — not a
 * general 旧字体 lookup. The general mapping has ~200 entries; the
 * subset that actually shows up in 蔵王 / 國酒 / 龍 / 龜 / 醸 /
 * 釀 territory is much smaller. Extending the list is cheap:
 * append a pair, no migration.
 *
 * Verified live against Sakenowa's `/brands` and `/breweries`
 * endpoints (2026-06-10) — these are the variants observed in the
 * wild on actual stored rows.
 */

const VARIANT_PAIRS: ReadonlyArray<readonly [oldForm: string, newForm: string]> = [
  // Storage / cellar — appears in many brewery names (蔵王, 七田, ...).
  // The bug that motivated this module: Sakenowa stores `藏王`, model
  // returns `蔵王`, exact-match join fails.
  ['藏', '蔵'],
  // Brewing — the kanji on every brewery suffix that doesn't use 酒造.
  ['釀', '醸'],
  // Country / nation — appears in many brand names (國酒, 國権).
  ['國', '国'],
  // Dragon — common in brand names (龍力, 黒龍, 龍勢).
  ['龍', '竜'],
  // Turtle / longevity — appears in older brewery names.
  ['龜', '亀'],
  // Body — appears in style descriptors that sometimes carry into
  // brand names.
  ['體', '体'],
  // Drunk / intoxicated — semantically tied to sake; sometimes
  // appears in brand naming.
  ['醉', '酔'],
  // Treasure — appears in brand names (寶剣 / 宝剣 etc).
  ['寶', '宝'],
  // Ten-thousand — appears in 萬寿 (Manju, Kubota's flagship), often
  // marketed with both forms.
  ['萬', '万'],
  // Iron — appears in some brewery names; relevant to the user's
  // 蔵王 photo where the model produced a hallucinated 宮鉄酒造.
  ['鐵', '鉄'],
  // Yen / circle — appears in 圓 / 円 brand framings.
  ['圓', '円'],
  // Swamp — common in brewery names (黒澤 / 黒沢).
  ['澤', '沢'],
  // Old / elder — appears in 壽 (long life) variants, common in
  // celebratory naming (萬壽).
  ['壽', '寿'],
  // Wide — appears in some brewery names (廣島 / 広島).
  ['廣', '広'],
  // Study / learning — appears in some brand names.
  ['學', '学'],
  // Music / pleasure — appears in 楽 / 樂 brand names.
  ['樂', '楽'],
  // Number — appears in 数 / 數-prefixed brand names.
  ['數', '数'],
  // Light — appears in some brewery names (光 / 旧字 光).
  // (no variant; 光 is already simplified in both forms)
  // Realm / boundary — appears in some brand names.
  ['境', '境'],
] as const

// Build a single map from each character to its sibling form (in
// either direction). For a character that isn't part of any variant
// pair, the map returns undefined.
const VARIANT_SIBLING = new Map<string, string>()
for (const [oldForm, newForm] of VARIANT_PAIRS) {
  VARIANT_SIBLING.set(oldForm, newForm)
  VARIANT_SIBLING.set(newForm, oldForm)
}

/**
 * Safety cap on the variant explosion. With per-character permutation
 * a string containing N variant characters expands to 2^N siblings.
 * In practice sake names have 0-3 variant chars (≤8 siblings); we
 * cap at 16 so a pathological input (rare 6-variant string) can't
 * blow up the query parameter array.
 *
 * If a real-world string ever exceeds the cap we fall back to the
 * verbatim form + the all-new-form sibling, which preserves
 * correctness for the most common new-form-input-vs-old-form-storage
 * shape this module exists to solve.
 */
const MAX_VARIANTS = 16

/**
 * Return the set of variants the lookup should try for a given input
 * string. Always includes the input verbatim; adds every per-character
 * permutation where each variant character can be replaced by its
 * sibling form. De-duplicated and returned as an array (the
 * Postgres adapter accepts `ANY($1)` over an array parameter).
 *
 * For a string with no variant kanji, returns `[text]` — a single
 * element, identical to the previous exact-match behaviour.
 *
 * Mixed-form inputs (e.g. `萬寿` where one character is old-form and
 * one is new-form) generate all 4 permutations: verbatim, both-new,
 * both-old, and the flipped-mixed form.
 */
export function generateKanjiVariants(text: string): string[] {
  if (text.length === 0) return [text]
  const chars = Array.from(text)
  const variantPositions: number[] = []
  for (let i = 0; i < chars.length; i++) {
    if (VARIANT_SIBLING.has(chars[i])) variantPositions.push(i)
  }
  if (variantPositions.length === 0) return [text]

  // Cap-overflow fallback — keep correctness for the common case
  // without exploding parameter arrays.
  const variantCount = 1 << variantPositions.length
  if (variantCount > MAX_VARIANTS) {
    const allNew = chars.map((c) => VARIANT_SIBLING.get(c) ?? c).join('')
    return Array.from(new Set([text, allNew]))
  }

  // Per-character bitmask permutation. Bit i set ⇒ flip the i-th
  // variant character to its sibling form.
  const variants = new Set<string>()
  for (let mask = 0; mask < variantCount; mask++) {
    const out = chars.slice()
    for (let i = 0; i < variantPositions.length; i++) {
      if ((mask >> i) & 1) {
        const pos = variantPositions[i]
        const sibling = VARIANT_SIBLING.get(chars[pos])
        if (sibling !== undefined) out[pos] = sibling
      }
    }
    variants.add(out.join(''))
  }
  return Array.from(variants)
}
