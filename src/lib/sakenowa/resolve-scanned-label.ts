import 'server-only'
import type { Pool } from 'pg'
import { debugAdd } from '@/lib/debug/debug-log'
import { resolveConfidenceTier } from '@/lib/scan/confidence-tier'
import type { LabelScanExtraction } from '@/lib/schemas/label-scan-extraction'
import {
  type BrandOnlyLookupResult,
  type BreweryOnlyLookupResult,
  type FindSakeByExtractionResult,
  type SakeLookupQuery,
  findSakeByBrandOnlyFromPool,
  findSakeByBreweryOnlyFromPool,
  findSakeByExtractionFromPool,
  expandLatinBrandVariants,
  findSakeByLatinBreweryFromPool,
  listSiblingBrandsFromPool,
  namesOverlapping,
  romajiKey,
} from './lookup'
import type { Brand } from '@/lib/schemas/brand'
import { expandBrandVariants } from './brewery-variants'
import { kanaToRomaji } from './kana-romaji'
import { getServerDbPool } from '../supabase/server-client'

// ---------- resolveScannedLabel ----------
//
// Single entry point that owns the WHOLE label-matching job for a
// vision extraction: the pre-lookup guards (confidence-tier gate,
// placeholder sentinel, Latin-brewery shaping, single-character
// hallucination rescue) AND the 5-pass Sakenowa cascade. Before #198
// the guards lived in `scan-action.ts` and re-implemented their own
// parallel cascade (brewery-only → field-swap brand-only) next to the
// nicely-tested pass chain in `lookup.ts`, so the composition — the
// part most likely to harbour a bug — was scattered across two modules
// and only reachable through the vision model + rate-limit gate.
//
// The guards are input-shaping that belongs WITH the thing that
// consumes the input, so they live here, next to the passes they
// orchestrate. `scan-action.ts` now shrinks to
// rate-limit → vision → resolveScannedLabel → map-to-render-state.
//
// The result is the closed `FindSakeByExtractionResult` union the pass
// cascade already returns, WIDENED by a single `low_confidence` arm.
// That arm is load-bearing: the guards deliberately route a placeholder
// / single-char / Latin-brewery extraction to `low_confidence`
// ("couldn't read the label clearly — try a closer shot") rather than
// `no_match` ("not in our catalogue"), because feeding Sakenowa a query
// that can never match would surface a confusing "not in catalogue"
// message for what is really a bad read. `FindSakeByExtractionResult`
// on its own can't express that distinction.

/**
 * The subset of a `LabelScanExtraction` the matcher needs. Taking a
 * `Pick` (rather than the full record) keeps the table-driven unit
 * tests free of the `source` provenance ceremony — a scanned label is,
 * for matching purposes, a (name, brewery, confidence) triple.
 */
export type ScannedLabel = Pick<LabelScanExtraction, 'name_ja' | 'brewery_ja' | 'confidence'> &
  Pick<Partial<LabelScanExtraction>, 'other_names'>

export type ResolveScannedLabelResult = FindSakeByExtractionResult | { kind: 'low_confidence' }

/**
 * The three lookup operations `resolveScannedLabel` composes. Extracted
 * as an injectable seam so the guard / cascade interactions
 * (single-char rescue, field-swap, placeholder routing) can be
 * exercised as table-driven unit tests with canned lookup results — no
 * Postgres, no vision model, no rate-limit gate. In production the
 * executor is bound to a `Pool` via `poolExecutor`; the shapes mirror
 * the standalone `findSakeBy*` seams exactly.
 */
export interface ScannedLabelLookupExecutor {
  findByExtraction(query: SakeLookupQuery): Promise<FindSakeByExtractionResult>
  findByBreweryOnly(query: SakeLookupQuery): Promise<BreweryOnlyLookupResult>
  findByBrandOnly(query: SakeLookupQuery): Promise<BrandOnlyLookupResult>
  /** For a label whose brewery was read in Latin script. */
  findByLatinBrewery(query: SakeLookupQuery): Promise<FindSakeByExtractionResult>
  /** The other sakes of the same brewery, for picking a sub-line. */
  listSiblings(brandId: number): Promise<readonly Brand[]>
}

function poolExecutor(pool: Pool): ScannedLabelLookupExecutor {
  return {
    findByExtraction: (query) => findSakeByExtractionFromPool(query, pool),
    findByBreweryOnly: (query) => findSakeByBreweryOnlyFromPool(query, pool),
    findByBrandOnly: (query) => findSakeByBrandOnlyFromPool(query, pool),
    findByLatinBrewery: (query) => findSakeByLatinBreweryFromPool(query, pool),
    listSiblings: (brandId) => listSiblingBrandsFromPool(brandId, pool, SIBLING_LIMIT),
  }
}

/** Enough to hold every line of the largest brewery in the catalogue. */
const SIBLING_LIMIT = 60

function isExecutor(x: Pool | ScannedLabelLookupExecutor): x is ScannedLabelLookupExecutor {
  return 'findByExtraction' in x
}

/**
 * Hiragana (U+3040–309F) + Katakana (U+30A0–30FF) + CJK Unified
 * Ideographs (U+4E00–9FFF). The three blocks cover every script a
 * label-scan extraction should produce for `name_ja` / `brewery_ja`.
 * Latin-only output is the failure mode the brewery guard catches.
 */
const JAPANESE_SCRIPT_REGEX = /[぀-ゟ゠-ヿ一-鿿]/

function containsNoJapaneseScript(value: string): boolean {
  return !JAPANESE_SCRIPT_REGEX.test(value)
}

/**
 * Detect a model "I give up" extraction: the Latin or kanji sentinel
 * values the prompt explicitly forbids (`不明`, `unknown`, etc.). Even
 * though the system prompt forbids these (see `anthropic-haiku-provider.ts`
 * § rule 5), models occasionally still emit them. We treat them
 * identically to a schema-validation failure — route to low_confidence
 * and never feed `不明` to Sakenowa lookup (no brand will ever match it;
 * the visitor sees a confusing "no match" instead of the honest "try a
 * closer shot").
 *
 * Originally surfaced 2026-06-14 on a clear Tanigawa-dake bottle: model
 * returned `{name_ja: "不明", brewery_ja: "不明", confidence: 0.45}`,
 * which tier-resolved to "retry" by confidence-luck. Hard-coding the
 * placeholder check ensures the routing doesn't depend on the model's
 * self-reported confidence.
 */
const PLACEHOLDER_EXTRACTIONS = new Set([
  '不明',
  '不明な',
  '不詳',
  '未確認',
  'unknown',
  'Unknown',
  'UNKNOWN',
  'n/a',
  'N/A',
  '—',
  '?',
  '？',
])

function isPlaceholderExtraction(value: string): boolean {
  return PLACEHOLDER_EXTRACTIONS.has(value.trim())
}

/**
 * Real-world sake brand names in Sakenowa are essentially never a
 * single character — the shortest brand kanji we've observed is two
 * characters (e.g. `磯自慢`, `黒龍`, `酔鯨`). A one-character `name_ja`
 * is a strong signal that the model produced "high-confidence coherent
 * garbage" — it returned a single kanji that *looks* plausible (`梗`
 * "stem", `斗` "dipper") at a confidence that normally implies a clean
 * read, but it's a hallucinated fragment, not a real brand. Caught in
 * 2026-06-11 mobile testing on a `jin_junmai_manzairaku.jpg` photo:
 * model returned `name_ja: '梗'` at confidence 0.72 (tier 'confirm') —
 * Sakenowa lookup correctly returned no_match, but the visitor never
 * gets to see *why* the scan failed unless we surface the heuristic in
 * the debug overlay.
 *
 * Routing to `low_confidence` (after the brewery-only + field-swap
 * rescues below both miss) is the right outcome: the visitor sees a
 * "couldn't read clearly" CTA and re-scans, instead of a confusing
 * "not in our catalogue" message.
 */
function looksLikeSingleCharHallucination(name_ja: string): boolean {
  // `Array.from` counts code points, not UTF-16 units, so a surrogate-
  // pair kanji (rare in sake names, but possible) reads as 1 not 2.
  return Array.from(name_ja).length === 1
}

/**
 * Resolve a scanned label (vision extraction) to a Sakenowa brand.
 *
 * Order:
 *   1. placeholder sentinel  — `不明` / `unknown` / … → low_confidence.
 *   2. Latin brewery         — the brewery was read in Latin script, as on
 *                              an importer's back label → the Latin-brewery
 *                              lookup, which leads with the brand and uses
 *                              the brewery's romaji to confirm it.
 *   3. single-char rescue    — 1-char name_ja is junk, but the brewery
 *                              may still resolve: brewery-only → then
 *                              field-swap brand-only on brewery_ja →
 *                              else low_confidence.
 *   4. full cascade          — `findByExtraction`.
 *   5. other names           — the product name or second script the
 *                              label prints picks a more specific line
 *                              of the same brewery, settles a list, or
 *                              is tried as the brand after a miss.
 *   6. confidence gate       — a read the model scored in the `retry` tier
 *                              is kept only where brand and brewery both
 *                              matched one catalogue row (`exact`, or the
 *                              brewery plus a brand that is part of the
 *                              stored name), or where the label named
 *                              the result a second time.
 *
 * The gate comes last, and lets `exact` through, because a model's score of
 * itself and a match in the catalogue are different evidence. A front label
 * that shows no brewery gets a low score from a careful model even when it
 * read the brand perfectly and knows who makes it; two fields agreeing with
 * one row out of thousands is not something a misread does by accident.
 * Anything short of that — brand only, brewery only, a list — still needs
 * the model's own confidence behind it.
 *
 * `poolOrExecutor` is a `Pool` in production (bound to the `findSakeBy*FromPool`
 * passes) or a fake `ScannedLabelLookupExecutor` in unit tests.
 */
export async function resolveScannedLabel(
  label: ScannedLabel,
  poolOrExecutor: Pool | ScannedLabelLookupExecutor = getServerDbPool(),
): Promise<ResolveScannedLabelResult> {
  const executor = isExecutor(poolOrExecutor) ? poolOrExecutor : poolExecutor(poolOrExecutor)
  const { confidence } = label

  const tier = resolveConfidenceTier(confidence)
  debugAdd('ScanAction', `extraction confidence ${confidence.toFixed(2)} → tier "${tier}"`, {
    confidence,
    tier,
  })

  const { resolved, corroborated } = await withOtherNames(label, await resolveByShape(label, executor), executor)
  if (tier === 'retry' && resolved.kind !== 'low_confidence' && !bothFieldsAgree(resolved) && !corroborated) {
    debugAdd(
      'ScanAction',
      `retry-tier read resolved to ${resolved.kind}, short of an exact match — routing to low_confidence`,
    )
    return { kind: 'low_confidence' }
  }
  return resolved
}

/**
 * Did brand and brewery both point at this one row? An exact match, or a
 * brewery match where the brand that was read is part of the stored name
 * (吉野杉 under 長龍酒造 for 吉野杉の樽酒) — a label cut off by the frame.
 */
function bothFieldsAgree(resolved: Exclude<ResolveScannedLabelResult, { kind: 'low_confidence' }>): boolean {
  if (resolved.kind === 'exact') return true
  return (
    resolved.kind === 'matched_brewery_only' &&
    namesOverlapping(resolved.brandDivergence.extracted, [resolved.brandDivergence.stored]).length === 1
  )
}

/** The romaji keys a name printed on a label may be stored under; none for kanji. */
function latinKeys(name: string): string[] {
  const kana = kanaToRomaji(name)
  if (kana !== null) return [romajiKey(kana)]
  if (!containsNoJapaneseScript(name)) return []
  // The lookup's own variants: "Awasaki Sparkling" is also "awasaki".
  return [...new Set(expandLatinBrandVariants(name).map(romajiKey))].filter((key) => key.length >= 3)
}

const storedKeys = (brand: Brand) =>
  [brand.name, brand.nameRomaji].flatMap((stored) => (stored == null ? [] : [romajiKey(stored)]))

/** Is `name`, as printed on a label, the catalogue's name for `brand`? */
function namesBrand(name: string, brand: Brand): boolean {
  if (expandBrandVariants(name).includes(brand.nameKanji)) return true
  // Kana and Latin are compared by sound: a furigana くろかぶと has no kanji row.
  const stored = storedKeys(brand)
  return latinKeys(name).some((key) => stored.includes(key))
}

/**
 * The one brand of `brands` that some other name names, whole name for whole
 * name. Undefined if no name singles one out. A product word that is only
 * part of a stored name is not enough: ゆき beside 雪 is not 雪の十和田.
 */
function namedBy(otherNames: readonly string[], brands: readonly Brand[]): Brand | undefined {
  for (const name of otherNames) {
    const named = brands.filter((b) => namesBrand(name, b))
    if (named.length === 1) return named[0]
  }
  return undefined
}

/**
 * Is this a sake the catalogue does not have, from a brewery it does?
 *
 * The list is that brewery's lines, and nothing the label prints — the name
 * the model chose or any other — is one of them or part of one; nor is the
 * name just the brewery's own (NINKI under 人気酒造, where a list of its
 * lines is the right question). The label printing a second name is what
 * says the first was read, not imagined. Then "not in the catalogue" is the
 * honest answer, and it is the one that lets the visitor keep the bottle as
 * their own; the brewery's other sakes still reach them as suggestions.
 */
async function isAnotherSakeOfTheBrewery(
  label: ScannedLabel,
  list: Extract<ResolveScannedLabelResult, { kind: 'ambiguous' }>,
  executor: ScannedLabelLookupExecutor,
): Promise<boolean> {
  const [first] = list.candidates
  if (!first || list.candidates.some((c) => c.brewery.breweryId !== first.brewery.breweryId)) return false

  const printed = [label.name_ja, ...otherNamesOf(label)]
  // Every line of the brewery, not only the few the list shows.
  const lines = [first.sake, ...(await executor.listSiblings(first.sake.brandId))]
  const namesALine = printed.some(
    (name) =>
      lines.some((line) => namesBrand(name, line)) ||
      namesOverlapping(name, lines.map((line) => line.nameKanji)).length > 0,
  )
  if (namesALine) return false

  const { nameKanji, nameRomaji } = first.brewery
  const isTheHouseName =
    nameKanji.includes(label.name_ja) || latinKeys(label.name_ja).some((key) => romajiKey(nameRomaji ?? '').includes(key))
  return !isTheHouseName
}

/** More names than this is a model listing the whole label; the rest add nothing. */
const MAX_OTHER_NAMES = 8

/** The label's other names, usable: non-empty, not the name itself, capped. */
function otherNamesOf(label: ScannedLabel): string[] {
  return (label.other_names ?? []).filter((n) => n.trim() !== '' && n !== label.name_ja).slice(0, MAX_OTHER_NAMES)
}

interface WithOtherNames {
  resolved: ResolveScannedLabelResult
  /**
   * The label named the result a second time: the matched sake in another
   * script, or a sibling line of the same brewery. Independent evidence,
   * which the confidence gate accepts in place of the model's own score.
   */
  corroborated: boolean
}

/**
 * Step 5: what the label's other names add to a result.
 *
 * - One sake was found, and another name is that sake in a second script
 *   (不動 beside "Fudoh", 黒兜 beside くろかぶと) or names another line of the
 *   same brewery (別格 beside 両國): the result is corroborated.
 * - One sake was found by a name read in Latin, and another name names a
 *   sibling line: the sibling is the bottle. Latin on a sake label is the
 *   house mark or an importer's "Sake BRAND Product" title, so the other
 *   name is the more specific of the two (あわ咲き for "FUKUJU" beside
 *   あわ咲き or "Awasaki"). Where the model chose a name in Japanese script,
 *   that name stands — which of two printed names is the product is not
 *   something the catalogue can tell us.
 * - A list was found: the candidate another name names is the answer, and
 *   an exact one — brand or brewery gave the list, a second name settled it.
 * - Nothing was found: each other name is tried as the brand, in order.
 */
async function withOtherNames(
  label: ScannedLabel,
  resolved: ResolveScannedLabelResult,
  executor: ScannedLabelLookupExecutor,
): Promise<WithOtherNames> {
  const otherNames = otherNamesOf(label)
  if (otherNames.length === 0) return { resolved, corroborated: false }

  if (resolved.kind === 'exact' || resolved.kind === 'matched_brand_only' || resolved.kind === 'matched_brewery_only') {
    const sameSakeAgain = otherNames.some((name) => namesBrand(name, resolved.sake))
    const sibling = namedBy(otherNames, await executor.listSiblings(resolved.sake.brandId))
    if (!sibling) return { resolved, corroborated: sameSakeAgain }
    if (!containsNoJapaneseScript(label.name_ja)) return { resolved, corroborated: true }

    debugAdd('ScanAction', `the label also names the sibling line "${sibling.nameKanji}" — preferring it to the Latin mark`, {
      matched: resolved.sake.nameKanji,
      otherNames,
    })
    if (resolved.kind === 'matched_brewery_only') {
      return {
        resolved: { ...resolved, sake: sibling, brandDivergence: { ...resolved.brandDivergence, stored: sibling.nameKanji } },
        corroborated: true,
      }
    }
    return { resolved: { ...resolved, sake: sibling }, corroborated: true }
  }

  if (resolved.kind === 'ambiguous') {
    const named = namedBy(otherNames, resolved.candidates.map((c) => c.sake))
    if (!named) {
      const unlisted = await isAnotherSakeOfTheBrewery(label, resolved, executor)
      return { resolved: unlisted ? { kind: 'no_match', query: resolved.query } : resolved, corroborated: false }
    }
    debugAdd('ScanAction', `another name on the label settles the list on "${named.nameKanji}"`, { otherNames })
    return { resolved: { kind: 'exact', sake: named }, corroborated: true }
  }

  for (const name of otherNames) {
    const retried = await resolveByShape({ ...label, name_ja: name }, executor)
    if (retried.kind !== 'no_match' && retried.kind !== 'low_confidence') {
      debugAdd('ScanAction', `name_ja "${label.name_ja}" found nothing; the label's other name "${name}" did`)
      if (retried.kind === 'ambiguous' && (await isAnotherSakeOfTheBrewery(label, retried, executor))) {
        return { resolved: { kind: 'no_match', query: retried.query }, corroborated: false }
      }
      return { resolved: retried, corroborated: false }
    }
  }
  return { resolved, corroborated: false }
}

/** Steps 1–4 of `resolveScannedLabel`: everything but the confidence gate. */
async function resolveByShape(
  { name_ja, brewery_ja, confidence }: ScannedLabel,
  executor: ScannedLabelLookupExecutor,
): Promise<ResolveScannedLabelResult> {
  // 1. Placeholder-sentinel guard. Hard-coded routing to low_confidence
  // so a placeholder at 0.85 doesn't pass through as `auto` and feed the
  // Sakenowa lookup a query that can never match.
  if (isPlaceholderExtraction(name_ja) || isPlaceholderExtraction(brewery_ja)) {
    debugAdd(
      'ScanAction',
      `extraction is a placeholder sentinel ("${name_ja}" / "${brewery_ja}") — routing to low_confidence regardless of confidence ${confidence.toFixed(2)}`,
      { name_ja, brewery_ja, confidence },
      'warn',
    )
    return { kind: 'low_confidence' }
  }

  // 2. Latin brewery. An importer's back label names the maker in Latin
  // only, and a model that follows the prompt returns it as printed. The
  // kanji passes cannot use it, so it gets its own lookup. A one-character
  // brand beside it leaves nothing to look up by.
  if (containsNoJapaneseScript(brewery_ja)) {
    if (looksLikeSingleCharHallucination(name_ja)) {
      debugAdd(
        'ScanAction',
        'one-character name_ja and a Latin-only brewery_ja — nothing to look up by, routing to low_confidence',
        { name_ja, brewery_ja },
        'warn',
      )
      return { kind: 'low_confidence' }
    }
    debugAdd('ScanAction', 'extraction.brewery_ja is Latin-only — using the Latin-brewery lookup', {
      name_ja,
      brewery_ja,
    })
    return executor.findByLatinBrewery({ nameJa: name_ja, breweryJa: brewery_ja })
  }

  // 3. Single-character brand hallucination guard. A 1-char name_ja is a
  // near-certain "high-confidence coherent garbage" signal. Before
  // retreating to low_confidence, try to rescue via the brewery.
  //
  // Real-world motivation (2026-06-11, Takashimizu): across 5 attempts
  // on the same image the model returned 5 different 1-char brands
  // (`紀, 斗, 幻, 寺田, 昇`) but the brewery `高清水酒造` every time. The
  // single-char guard correctly identifies the brand as junk; routing
  // straight to low_confidence would throw away a perfectly good brewery
  // signal.
  if (looksLikeSingleCharHallucination(name_ja)) {
    debugAdd(
      'ScanAction',
      `extraction name_ja is a single character ("${name_ja}") — likely high-confidence hallucination, trying brewery-only fallback before low_confidence`,
      { name_ja, brewery_ja, confidence },
      'warn',
    )
    const breweryOnly = await executor.findByBreweryOnly({ nameJa: name_ja, breweryJa: brewery_ja })
    if (breweryOnly.kind === 'matched_brewery_only' || breweryOnly.kind === 'ambiguous') {
      debugAdd('ScanAction', `single-char guard rescued by brewery-only fallback — ${breweryOnly.kind}`)
      return breweryOnly
    }

    // Brewery-only missed. One more rescue: the model may have committed
    // a FIELD SWAP — putting the brand kanji in the brewery_ja field
    // because the brand is the prominent kanji on the bottle and the
    // real brewery (e.g. `秋田酒類製造` for Takashimizu) is small / in
    // the corner. Try a brand-only lookup on the brewery_ja value.
    debugAdd(
      'ScanAction',
      `brewery-only missed; trying brand-only on brewery_ja "${brewery_ja}" — checking for field-swap (model put brand in brewery field)`,
    )
    const swapAttempt = await executor.findByBrandOnly({ nameJa: brewery_ja, breweryJa: brewery_ja })
    if (swapAttempt.kind === 'matched_brand_only' || swapAttempt.kind === 'ambiguous') {
      debugAdd('ScanAction', `field-swap rescue succeeded — ${swapAttempt.kind} via brewery_ja`)
      return swapAttempt
    }

    // Field-swap rescue also missed. Brand was probably hallucinated AND
    // the brewery field doesn't correspond to any known brand or brewery.
    debugAdd(
      'ScanAction',
      'single-char guard + brewery-only + field-swap rescue all missed — routing to low_confidence',
    )
    return { kind: 'low_confidence' }
  }

  // 4. Full 5-pass cascade (first-pass exact → brand-only → brewery-only
  // → field-swap → Latin). Owns its own internal guard ordering.
  return executor.findByExtraction({ nameJa: name_ja, breweryJa: brewery_ja })
}
