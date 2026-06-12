import { expandKanaVariants } from './kana-variants'
import { generateKanjiVariants } from './kanji-variants'

/**
 * Operational suffixes Sakenowa preserves on brewery `name_kanji`.
 * `CLAUDE.md` / the vision SYSTEM_PROMPT explicitly tell the model to
 * KEEP these — they're part of the brewery's core name. But the model
 * drops them inconsistently in production, so the lookup needs to
 * tolerate the missing-suffix shape defensively.
 *
 * Ordering: longest first (`酒造場` / `酒造店` before `酒造`) so the
 * `endsWith` check in `hasOperationalSuffix` never short-circuits on
 * the shorter form when the longer is what's actually present.
 */
const OPERATIONAL_SUFFIXES = ['酒造場', '酒造店', '酒造', '醸造'] as const

function hasOperationalSuffix(brewery: string): boolean {
  return OPERATIONAL_SUFFIXES.some((s) => brewery.endsWith(s))
}

/**
 * Generates the set of brewery `name_kanji` candidates to query
 * Sakenowa with. Two-stage expansion:
 *
 *   1. Operational-suffix expansion. If the input already ends with
 *      one of `酒造 / 醸造 / 酒造店 / 酒造場`, it's treated as
 *      canonical — only the verbatim form is kept. Otherwise we
 *      append each suffix, so a model that returned a "stem"
 *      brewery name like `高清水` still finds Sakenowa's stored
 *      `高清水酒造`.
 *
 *   2. Kanji-variant expansion. Each suffix variant is run through
 *      `generateKanjiVariants` to also cover 旧字体 ↔ 新字体 pairs
 *      (e.g. `釀` ↔ `醸`, `藏` ↔ `蔵`). Most operational suffixes
 *      have no variant kanji; the brewery's stem is where most of
 *      the variants live.
 *
 * Deduped via `Set` to avoid issuing the same candidate twice when
 * the expansions collapse (common: `酒` and `造` have no variant
 * forms, so suffixed candidates often deduplicate against each
 * other after the kanji-variant pass).
 *
 * Returns `[brewery]` for empty / unusual inputs — the caller's
 * `ANY($1)` SQL handles a single-element array fine.
 */
export function expandBreweryVariants(brewery: string): string[] {
  if (brewery.length === 0) return [brewery]

  const suffixVariants = hasOperationalSuffix(brewery)
    ? [brewery]
    : [brewery, ...OPERATIONAL_SUFFIXES.map((s) => brewery + s)]

  // Compose suffix expansion × kana-cross × kanji-variant. The kana
  // pass adds hiragana ↔ katakana siblings (covers ~10 % of Sakenowa
  // brewery names that include kana); the kanji pass adds 旧/新 form
  // siblings; both are no-ops on inputs that don't apply.
  const all = suffixVariants.flatMap((s) =>
    expandKanaVariants(s).flatMap(generateKanjiVariants),
  )
  return [...new Set(all)]
}

/**
 * If `text` ends with one of the operational suffixes, returns the
 * stem (suffix removed). Returns `null` if there's no recognised
 * suffix to strip. Longest suffixes are checked first, mirroring
 * `hasOperationalSuffix`, so `齋彌酒造店` is stripped to `齋彌`,
 * not to `齋彌酒造店` minus a final `店`.
 */
export function stripOperationalSuffix(text: string): string | null {
  for (const suffix of OPERATIONAL_SUFFIXES) {
    if (text.endsWith(suffix)) {
      return text.slice(0, text.length - suffix.length)
    }
  }
  return null
}

/**
 * Generates the candidate set when we're trying to interpret a
 * string as a BRAND kanji. Mirrors `expandBreweryVariants` in
 * reverse: if the input has an operational suffix (`酒造`, etc),
 * also include the stem because real brand names are never
 * suffixed. Then runs kanji-variant expansion (旧字体 ↔ 新字体) over
 * the whole set.
 *
 * Motivating case (2026-06-11): scan-action's field-swap rescue
 * calls findSakeByBrandOnly with `extraction.brewery_ja` =
 * `高清水酒造`. The verbatim form has no Sakenowa brand row.
 * Stripping the `酒造` suffix gives `高清水` which IS a brand
 * (Takashimizu). Without the stem expansion the rescue misses and
 * the bottle goes to low_confidence even though it's fully
 * identifiable.
 */
/**
 * Generates the candidate set when we're treating a string as a
 * BRAND kanji for lookup. Composes:
 *   - kana-cross siblings (hiragana ↔ katakana)
 *   - kanji 旧字体 ↔ 新字体 variants
 *
 * Used by the first-pass `(brand AND brewery)` join and the
 * standalone brand-only lookup when called with a known-brand
 * input. Does NOT do operational-suffix stripping —
 * `expandPossibleBrandVariants` layers that on top for the
 * field-swap path where the input could be a brand-with-suffix.
 */
export function expandBrandVariants(text: string): string[] {
  if (text.length === 0) return [text]
  return [...new Set(expandKanaVariants(text).flatMap(generateKanjiVariants))]
}

export function expandPossibleBrandVariants(text: string): string[] {
  if (text.length === 0) return [text]

  const stem = stripOperationalSuffix(text)
  const baseForms = stem !== null ? [text, stem] : [text]

  // Compose kana-cross × kanji-variant on each base form. The kana
  // pass catches the ~314 Sakenowa brands stored in pure kana
  // (`うまみ` / `ウマミ`, `あたごのまつ` / `アタゴノマツ`, etc).
  const all = baseForms.flatMap((s) =>
    expandKanaVariants(s).flatMap(generateKanjiVariants),
  )
  return [...new Set(all)]
}
