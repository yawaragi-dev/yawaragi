import type { Brand } from '@/lib/schemas/brand'
import { expandBrandVariants } from './brewery-variants'
import { kanaToRomaji } from './kana-romaji'
import { romajiKey } from './romaji-key'

// The label-matching cascade's rules that need no database: how a read
// name is widened into the spellings to look up, and when a row already
// in hand agrees with what the label says. Pure functions, so they are
// unit-tested without Postgres (`label-match-rules.test.ts`); the queries
// that use them are in `label-match.ts`.

/**
 * The catalogue sometimes lists one sake twice under one brewery, once per
 * script: 達磨正宗 and ダルマ正宗, both read "Daruma Masamune". Asking the
 * visitor to choose between them is asking nothing, so rows of one brewery
 * with one reading count as one — the kanji spelling, else the older row.
 */
export function collapseSameReading<T extends { sake: Brand }>(candidates: readonly T[]): T[] {
  const HAS_KANJI = /[一-鿿]/
  const groups = new Map<string, T>()
  for (const candidate of candidates) {
    const { sake } = candidate
    const reading = sake.nameRomaji ?? null
    const key = reading === null ? `id:${sake.brandId}` : `${sake.breweryId}:${romajiKey(reading)}`
    const kept = groups.get(key)
    const better =
      kept === undefined ||
      (HAS_KANJI.test(sake.nameKanji) && !HAS_KANJI.test(kept.sake.nameKanji)) ||
      (HAS_KANJI.test(sake.nameKanji) === HAS_KANJI.test(kept.sake.nameKanji) && sake.brandId < kept.sake.brandId)
    if (better) groups.set(key, candidate)
  }
  return [...groups.values()]
}

/**
 * The first pass's brewery rule, for rows already in hand: the stored name
 * equals a variant as written, with its spaces removed, or in one of its
 * space-separated parts.
 */
export function breweryKanjiAgrees(stored: string, variants: readonly string[]): boolean {
  const parts = stored.split(/[\s　]+/)
  return variants.includes(stored) || variants.includes(parts.join('')) || parts.some((p) => variants.includes(p))
}

/**
 * Which of a brewery's brand names the read is part of, or contains. A label
 * read as 樽酒 under 長龍酒造 is that brewery's 吉野杉の樽酒 and none of its
 * other lines. Names of one character are ignored on both sides.
 */
export function namesOverlapping(read: string, storedNames: readonly string[]): number[] {
  const reads = expandBrandVariants(read).filter((r) => Array.from(r).length >= 2)
  return storedNames.flatMap((stored, index) =>
    Array.from(stored).length >= 2 && reads.some((r) => stored.includes(r) || r.includes(stored)) ? [index] : [],
  )
}

const JAPANESE_SCRIPT_REGEX_LOOKUP = /[぀-ゟ゠-ヿ一-鿿]/
const LATIN_ALPHA_REGEX = /[A-Za-z]/

export function containsJapaneseScript(value: string): boolean {
  return JAPANESE_SCRIPT_REGEX_LOOKUP.test(value)
}

export function containsLatinAlpha(value: string): boolean {
  return LATIN_ALPHA_REGEX.test(value)
}

/**
 * The name as Latin letters, if it can be compared with the catalogue's
 * romaji: a name read in Latin script as it is, a name read in kana
 * (ハナトモエ, a furigana くろかぶと) sounded out. `null` for a name with
 * kanji in it, which has no reading we can derive.
 */
export function asLatinName(value: string): string | null {
  if (containsLatinAlpha(value) && !containsJapaneseScript(value)) return value
  return kanaToRomaji(value)
}

/**
 * Sake grade / style descriptors that are NEVER brand names. When a
 * Latin extraction begins with one of these, the first-word-strip
 * variant is suppressed — leaving just the verbatim and space-stripped
 * forms. Why: the model sometimes returns the descriptor text as the
 * brand (Kiku-Masamune, 2026-06-14: bottle reads "JUNMAI TARU SAKE
 * 菊正宗", model returned `name_ja: "JUNMAI TARU SAKE"`), and the
 * first-word-strip then dropped `"junmai"` into the lookup candidates.
 * Sakenowa has brands whose Latin name begins with `Junmai` (and
 * `Daiginjo`, etc.), so the bare descriptor would match an unrelated
 * brand and surface as `matched_brand_only` with a divergence card
 * pointing at the WRONG sake.
 *
 * Includes grade designations, brewing methods, filtration / aging
 * styles, and rice-state tokens. All lowercased; matched against the
 * lowercased first word of the input.
 */
const SAKE_GRADE_TOKENS = new Set<string>([
  'junmai',
  'ginjo',
  'daiginjo',
  'honjozo',
  'tokubetsu',
  'futsushu',
  'kimoto',
  'yamahai',
  'sokujo',
  'nigori',
  'namazake',
  'nama',
  'genshu',
  'taru',
  'taruzake',
  'kijoshu',
  'koshu',
  'shiboritate',
  'hiyaoroshi',
  'sparkling',
])

/**
 * Expands a Latin brand candidate into the set of lookup keys we
 * actually query. Four transforms:
 *   - Verbatim (lowercased).
 *   - For multi-word inputs where the first word is substantial
 *     (≥ 4 characters) AND NOT in `SAKE_GRADE_TOKENS`, also try the
 *     first word alone. Catches `Kizakura Perle` → also try
 *     `Kizakura`. The grade-token guard prevents
 *     `JUNMAI TARU SAKE` → `junmai` matching unrelated brands.
 *   - Space-stripped form for `name_romaji` (which the #121 ingest
 *     pipeline stores as single-word camel Latin like `Tanigawadake`).
 *   - Leading words, grade words dropped: `SAWA NO HANA Kokoro` → also
 *     `sawa no hana` (and `sawanohana`).
 *
 * Returns lowercased strings so the SQL only has to LOWER() each
 * column on the right-hand side.
 */
export function expandLatinBrandVariants(text: string): string[] {
  const trimmed = text.trim()
  if (trimmed.length === 0) return []
  const verbatim = trimmed.toLowerCase()
  // A hyphen is a word break: labels write DARUMA-MASAMUNE and NINKI-ICHI,
  // the catalogue's romaji writes words or runs them together. The verbatim
  // form stays a candidate for the names that do carry one (`Shangri-la`).
  const lower = verbatim.replace(/[-‐‑–—]+/g, ' ').replace(/\s+/g, ' ').trim()
  const variants = new Set<string>([verbatim, lower])
  // First-word strip: "Kizakura Perle" → also try "Kizakura". 4-char
  // floor so we don't match noise like "Big River" → "Big". Skip the
  // strip entirely if the first word is a sake grade / style token
  // (`junmai`, `daiginjo`, `taru`, …) — those are descriptors, never
  // brand names.
  const firstSpace = trimmed.indexOf(' ')
  if (firstSpace >= 4) {
    const firstWordLower = trimmed.slice(0, firstSpace).toLowerCase()
    if (!SAKE_GRADE_TOKENS.has(firstWordLower)) {
      variants.add(firstWordLower)
    }
  }
  // Space-stripped form: the LLM-derived `name_romaji` column is
  // populated by the #121 ingest pipeline using single-word camel-style
  // Latin (e.g. `Tanigawadake`, `Kawatsuru Shuzo`'s brand `Kawatsuru`).
  // A visitor / model who returns the natural space-separated form
  // (`"Tanigawa Dake"`, `"Kawatsuru"`) should still match. Only adds
  // a variant when the input actually contains a space (the
  // already-spaceless case is covered by `lower`).
  if (lower.includes(' ')) {
    variants.add(lower.replace(/\s+/g, ''))
  }
  // Leading words, longest first, with grade words dropped wherever they
  // sit: a label's Latin often runs the line and the product together —
  // "SAWA NO HANA Kokoro" is 澤の花 "Sawa no Hana" plus the product "Kokoro",
  // and "sawa" alone is not the line. Safe to widen: the SQL compares whole
  // names for equality, so a prefix can only match a line with exactly that
  // name. Two words or more, since one word is the first-word rule above.
  const words = lower.split(/\s+/).filter((w) => !SAKE_GRADE_TOKENS.has(w))
  for (let n = words.length; n >= 2; n--) {
    const prefix = words.slice(0, n).join(' ')
    variants.add(prefix)
    variants.add(prefix.replace(/\s+/g, ''))
  }
  return [...variants]
}

/**
 * Words a Latin brewery name carries that say "this is a brewery" and no
 * more. A back label writes "Dewazakura Sake Brewery" where the catalogue's
 * romaji is "Dewazakura Shuzo"; with these dropped both are "dewazakura".
 */
const GENERIC_BREWERY_WORDS = new Set<string>([
  'sake',
  'brewery',
  'breweries',
  'brewing',
  'shuzo',
  'shuzou',
  'shuzoten',
  'jozo',
  'jouzo',
  'shoten',
  'co',
  'ltd',
  'inc',
  'corp',
  'corporation',
  'company',
  'the',
])

/** The words of a Latin brewery name that identify it, as romaji keys. */
export function latinBreweryCore(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 0 && !GENERIC_BREWERY_WORDS.has(word))
    .map(romajiKey)
}

/**
 * Does a brewery read in Latin off a label name the same brewery as the
 * catalogue's romaji? True when the identifying words of one are all among
 * the other's: "Rihaku Sake Brewery" and "Rihaku Shuzo", "Shiraki Brewery"
 * and "Shiraki Tsunesuke Shoten". An importer ("Ginza Berlin"), a country
 * or the brand repeated in the brewery field agrees with nothing.
 */
export function latinBreweryAgrees(extracted: string, storedRomaji: string | null): boolean {
  if (storedRomaji === null) return false
  const a = latinBreweryCore(extracted)
  const b = latinBreweryCore(storedRomaji)
  if (a.length === 0 || b.length === 0) return false
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a]
  return shorter.every((word) => longer.includes(word))
}

/** The romaji keys to look a Latin brewery name up under. */
export function latinBreweryCandidates(text: string): string[] {
  const core = latinBreweryCore(text).join('')
  if (core.length === 0) return []
  return [core, ...['shuzo', 'jozo', 'shuzoten', 'shoten', 'sakebrewery'].map((suffix) => romajiKey(core + suffix))]
}
