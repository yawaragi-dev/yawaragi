/**
 * Old-form (旧字体, kyūjitai) ↔ new-form (新字体, shinjitai) kanji
 * variant groups that occur in sake brand and brewery names. Used by
 * `findSakeByExtraction` to widen the join so a model reading
 * 蔵王 (new) matches the Sakenowa-stored 藏王 (old), or vice versa.
 *
 * Members of a group are semantically identical — the Japanese
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
 * append a group, no migration.
 *
 * Verified live against Sakenowa's `/brands` and `/breweries`
 * endpoints (2026-06-10) — these are the variants observed in the
 * wild on actual stored rows.
 */

/**
 * A variant group is a set of N ≥ 2 visually-equivalent kanji forms
 * (kyūjitai, shinjitai, and the occasional intermediate ryakuji /
 * itaiji). All members of a group are semantically identical and
 * should match each other in a brand- or brewery-name lookup.
 *
 * Most groups are 2-character pairs (旧字体 ↔ 新字体). A handful are
 * 3-character triplets — `濱 ↔ 濵 ↔ 浜` ("beach") is the canonical
 * example: 濱 (U+6FF1) is the orthodox kyūjitai, 浜 (U+6D5C) the
 * post-1946 shinjitai, and 濵 (U+6FF5) an intermediate itaiji that
 * some breweries (and OCR models) use. Treating it as one triplet
 * rather than two overlapping pairs keeps the equivalence transitive
 * by construction.
 */
const VARIANT_GROUPS: ReadonlyArray<ReadonlyArray<string>> = [
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
  // Beach / shore — triplet. 濱 (U+6FF1) is the orthodox kyūjitai,
  // 浜 (U+6D5C) the post-1946 shinjitai, and 濵 (U+6FF5) an
  // intermediate itaiji. Motivating bug (2026-06-14 Sekitoba scan):
  // the model extracted `濵田酒造` for brewery 783 stored as
  // `濱田酒造`, and the variant gap dropped the join.
  ['濱', '濵', '浜'],
  // Bay / gulf — appears in coastal brewery and brand names
  // (e.g. 湾 / 灣 framings).
  ['灣', '湾'],
  // Honour / fame — appears in brand names (出羽の譽 / 出羽の誉,
  // 譽田 / 誉田 style surnames in brewery naming).
  ['譽', '誉'],
  // Love / longing — appears in seasonal brand names
  // (e.g. 恋しぐれ); old form 戀 shows up on older labels.
  ['戀', '恋'],
  // View / contemplate — appears in 観音 / 觀音 and 観月 / 觀月
  // brand naming.
  ['觀', '観'],
  // Respond / accept — appears in older brand names
  // (大應 / 大応 family).
  ['應', '応'],
] as const

// Build a map from each character to its sibling forms (every other
// member of the same variant group). Pairs give each member one
// sibling; triplet groups (濱 / 濵 / 浜) give each member two.
const VARIANT_SIBLINGS = new Map<string, ReadonlyArray<string>>()
for (const group of VARIANT_GROUPS) {
  for (const member of group) {
    VARIANT_SIBLINGS.set(
      member,
      group.filter((other) => other !== member),
    )
  }
}

/**
 * Safety cap on the variant explosion. With per-character expansion
 * a string containing N variant characters expands to ∏(groupSize)
 * siblings — 2^N for the all-pairs case, larger when triplets are
 * involved. In practice sake names have 0-3 variant chars
 * (≤27 siblings even with all triplets); we cap at 32 so a
 * pathological input can't blow up the query parameter array.
 *
 * If a real-world string ever exceeds the cap we fall back to the
 * verbatim form + the canonical-new-form sibling, which preserves
 * correctness for the most common new-form-input-vs-old-form-storage
 * shape this module exists to solve.
 */
const MAX_VARIANTS = 32

/**
 * For each character of `chars`, return the list of forms that
 * position is allowed to take — always starting with the character
 * itself, followed by its sibling variants (if any). For
 * non-variant characters this is a single-element list.
 */
function perCharOptions(chars: ReadonlyArray<string>): string[][] {
  return chars.map((c) => {
    const siblings = VARIANT_SIBLINGS.get(c)
    return siblings === undefined ? [c] : [c, ...siblings]
  })
}

/**
 * Cartesian product of per-character options. Caller has already
 * bounded the total count against MAX_VARIANTS so this won't explode.
 */
function cartesian(options: string[][]): string[] {
  let acc: string[] = ['']
  for (const slot of options) {
    const next: string[] = []
    for (const prefix of acc) {
      for (const choice of slot) next.push(prefix + choice)
    }
    acc = next
  }
  return acc
}

/**
 * Return the set of variants the lookup should try for a given input
 * string. Always includes the input verbatim; adds every per-character
 * permutation where each variant character can be replaced by any of
 * its sibling forms. De-duplicated and returned as an array (the
 * Postgres adapter accepts `ANY($1)` over an array parameter).
 *
 * For a string with no variant kanji, returns `[text]` — a single
 * element, identical to the previous exact-match behaviour.
 *
 * Mixed-form inputs (e.g. `萬寿` where one character is old-form and
 * one is new-form) generate all 4 permutations: verbatim, both-new,
 * both-old, and the flipped-mixed form. Triplet members likewise
 * expand to all 3 forms per position.
 */
export function generateKanjiVariants(text: string): string[] {
  if (text.length === 0) return [text]
  const chars = Array.from(text)
  const options = perCharOptions(chars)
  let variantCount = 1
  for (const slot of options) variantCount *= slot.length
  if (variantCount === 1) return [text]

  // Cap-overflow fallback — keep correctness for the common case
  // without exploding parameter arrays. The "canonical-new" form
  // picks the last sibling of each group, which by convention is
  // the post-1946 shinjitai (e.g. 浜 for the 濱/濵/浜 triplet).
  if (variantCount > MAX_VARIANTS) {
    const allNew = chars
      .map((c) => {
        const siblings = VARIANT_SIBLINGS.get(c)
        return siblings === undefined ? c : siblings[siblings.length - 1]
      })
      .join('')
    return Array.from(new Set([text, allNew]))
  }

  return Array.from(new Set(cartesian(options)))
}

/**
 * Predicate: are `a` and `b` kanji-variants of each other? True when
 * either is in the other's `generateKanjiVariants` expansion. Identical
 * strings are trivially variants. Used by the matched_brand_only UX:
 * when the visitor's extracted brand (`蔵王`) is a 旧/新 form sibling
 * of the catalogue's stored brand (`藏王`), display the visitor's form
 * so the card matches what they see on the bottle. The lookup still
 * resolved to the canonical row — only the displayed string changes.
 */
export function isKanjiVariant(a: string, b: string): boolean {
  if (a === b) return true
  return generateKanjiVariants(a).includes(b)
}
