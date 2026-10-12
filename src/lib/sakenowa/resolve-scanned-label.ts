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
  findSakeByLatinBreweryFromPool,
  namesOverlapping,
} from './lookup'
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
export type ScannedLabel = Pick<LabelScanExtraction, 'name_ja' | 'brewery_ja' | 'confidence'>

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
}

function poolExecutor(pool: Pool): ScannedLabelLookupExecutor {
  return {
    findByExtraction: (query) => findSakeByExtractionFromPool(query, pool),
    findByBreweryOnly: (query) => findSakeByBreweryOnlyFromPool(query, pool),
    findByBrandOnly: (query) => findSakeByBrandOnlyFromPool(query, pool),
    findByLatinBrewery: (query) => findSakeByLatinBreweryFromPool(query, pool),
  }
}

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
 *   5. confidence gate       — a read the model scored in the `retry` tier
 *                              is kept only where brand and brewery both
 *                              matched one catalogue row (`exact`, or the
 *                              brewery plus a brand that is part of the
 *                              stored name).
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

  const resolved = await resolveByShape(label, executor)
  if (tier === 'retry' && resolved.kind !== 'low_confidence' && !bothFieldsAgree(resolved)) {
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
