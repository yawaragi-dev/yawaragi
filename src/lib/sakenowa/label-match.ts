import 'server-only'
import type { Pool } from 'pg'
import { debugAdd } from '@/lib/debug/debug-log'
import type { Brand } from '@/lib/schemas/brand'
import type { Brewery } from '@/lib/schemas/brewery'
import { publicQuery } from '@/lib/supabase/public-query'
import { getServerDbPool } from '@/lib/supabase/server-client'
import { type BrandRow, type BreweryRow, rowToBrand, rowToBrewery } from './db'
import {
  expandBrandLineVariants,
  expandBrandVariants,
  expandBreweryVariants,
  expandPossibleBrandVariants,
  stripOperationalSuffix,
} from './brewery-variants'
import { withFormerBreweryNames } from './former-brewery-names'
import {
  asLatinName,
  breweryKanjiAgrees,
  collapseSameReading,
  containsJapaneseScript,
  containsLatinAlpha,
  expandLatinBrandVariants,
  latinBreweryAgrees,
  latinBreweryCandidates,
  latinBreweryCore,
  namesOverlapping,
} from './label-match-rules'
import { getRomajiIndex } from './romaji-index'
import { looseRomajiKey, romajiKey } from './romaji-key'

// Like the reads in `catalogue-reads.ts`, every query here filters
// `superseded_at IS NULL` (ADR-0014).

// ---------- findSakeByExtraction ----------
//
// Given a `LabelScanExtraction` (kanji name + kanji brewery), resolve it
// to a Sakenowa-mirrored Sake brand. PRD #105 §"Sakenowa lookup for
// extraction" — match strategy is exact on `brands.name_kanji` joined to
// `breweries.name_kanji`. Romaji is deliberately NOT a fallback at this
// seam: CONTEXT.md "Same-romaji collisions are possible across Breweries
// and Sakes", and the LLM extraction returns Japanese script.
//
// The function returns a tagged union so the caller (the Server Action,
// the result UI) branches on `kind` rather than on tuple-of-arrays
// patterns that hide intent.
//
// Ambiguous-match seeding is deferred to S4 per the issue spec; the
// `ambiguous` arm exists from day 1 so the union is closed and the UI
// renders the placeholder in case Sakenowa produces a duplicate name
// pair in the wild.

/**
 * What the lookup matched against. Captures both fields the caller passed
 * so result-UI copy ("we couldn't find 獺祭 by 旭酒造") doesn't have to
 * re-thread the extraction back through props.
 */
export interface SakeLookupQuery {
  nameJa: string
  breweryJa: string
}

export type FindSakeByExtractionResult =
  | { kind: 'exact'; sake: Brand }
  /**
   * The first-pass `(brand AND brewery)` join returned zero, but the
   * brand-only fallback (#123) found exactly one row. The brand is
   * unambiguously identified, but the brewery the model extracted
   * doesn't match what Sakenowa stores for that brand. UI MUST
   * surface this divergence honestly — silently navigating to a sake
   * whose brewery doesn't match the label is worse than saying "we're
   * not sure". `breweryDivergence.stored` is the canonical brewery
   * kanji from Sakenowa; `extracted` is what the model returned.
   */
  | {
      kind: 'matched_brand_only'
      sake: Brand
      brewery: Brewery
      breweryDivergence: { extracted: string; stored: string }
      query: SakeLookupQuery
    }
  /**
   * The structural dual of `matched_brand_only`. First-pass missed,
   * brand-only fallback also missed, but a third-pass brewery-only
   * lookup found exactly one brand under that brewery. The brewery
   * is unambiguously identified (a mono-brand brewery, or a brewery
   * where Sakenowa has only one brand line), but the brand the model
   * extracted doesn't match what Sakenowa stores for that brewery.
   * Same divergence-surfacing UX as `matched_brand_only` — UI shows
   * the gap honestly and requires an explicit tap to navigate.
   * `brandDivergence.stored` is the canonical brand kanji from
   * Sakenowa; `extracted` is what the model returned.
   */
  | {
      kind: 'matched_brewery_only'
      sake: Brand
      brewery: Brewery
      brandDivergence: { extracted: string; stored: string }
      query: SakeLookupQuery
    }
  /**
   * Multiple Sakenowa brands match the query. The UI shows a
   * disambiguation list — one tappable row per candidate carrying
   * the brand kanji + romaji and the brewery info so the visitor
   * can pick which bottle they actually scanned. Each candidate
   * carries its full Brand AND Brewery objects so the UI doesn't
   * have to round-trip more lookups; the JOINed SQL queries
   * already pull both sides.
   */
  | {
      kind: 'ambiguous'
      candidates: readonly { sake: Brand; brewery: Brewery }[]
      query: SakeLookupQuery
    }
  | { kind: 'no_match'; query: SakeLookupQuery }

// First-pass: pulls brand rows whose `name_kanji` matches exactly AND
// whose joined brewery's `name_kanji` matches exactly. Also pulls
// the JOINed brewery columns so the ambiguous arm can return full
// brand+brewery pairs for the disambiguation list — the JOIN happens
// for the WHERE either way, no extra cost. LIMIT 5 (was 2) so the
// disambiguation list can render multiple candidates when same-name
// collisions occur across breweries (Hakushika, etc).
const SELECT_BRANDS_BY_KANJI_EXTRACTION = `
  SELECT
    br.brand_id          AS brand_brand_id,
    br.name              AS brand_name,
    br.name_kanji        AS brand_name_kanji,
    br.name_romaji       AS brand_name_romaji,
    br.brewery_id        AS brand_brewery_id,
    br.source            AS brand_source,
    br.confidence        AS brand_confidence,
    b.brewery_id         AS brewery_brewery_id,
    b.name               AS brewery_name,
    b.name_kanji         AS brewery_name_kanji,
    b.name_romaji        AS brewery_name_romaji,
    b.area_id            AS brewery_area_id,
    b.source             AS brewery_source,
    b.confidence         AS brewery_confidence
  FROM brands br
  JOIN breweries b ON b.brewery_id = br.brewery_id
  -- ANY($1) / ANY($2) match the kanji-variant-expanded arrays so a
  -- vision-model output that uses 新字体 (new-form, e.g. 蔵王) still
  -- joins against Sakenowas 旧字体 row (e.g. 藏王). The variant
  -- expansion happens in JS in generateKanjiVariants. Most strings
  -- expand to 1 element (no variant kanji); worst case is 2-3
  -- elements, well within ANY()s performance envelope.
  -- The brewery side also matches with the stored name's spaces removed, or
  -- on any one of its space-separated parts: Sakenowa stores some names with
  -- a space the label does not print ('仙台伊澤家 勝山酒造', 38 such
  -- breweries), and a label often prints only the last part ('勝山酒造').
  WHERE br.name_kanji = ANY($1) AND (
         b.name_kanji = ANY($2)
      OR regexp_replace(b.name_kanji, '[[:space:]　]+', '', 'g') = ANY($2)
      OR regexp_split_to_array(b.name_kanji, '[[:space:]　]+') && $2::text[]
    )
    AND br.superseded_at IS NULL
    AND b.superseded_at IS NULL
  ORDER BY br.brand_id
  LIMIT 5
`

// Second-pass (#123): brand kanji only — used when the first pass
// returns 0 rows. Pulls brand columns AND brewery columns from the
// same JOIN so the matched_brand_only branch has the stored brewery
// kanji to surface in the divergence UI without a second round-trip.
// Column aliases are namespaced (`brand_*` / `brewery_*`) because both
// tables carry overlapping column names (brand_id, name, name_kanji,
// source, confidence) — the namespacing makes the pg row object
// unambiguous to deserialise.
//
// Third-pass (brewery-only) below uses the same joined shape under a
// different WHERE clause.
const SELECT_BRANDS_AND_BREWERIES_BY_BRAND_KANJI = `
  SELECT
    br.brand_id          AS brand_brand_id,
    br.name              AS brand_name,
    br.name_kanji        AS brand_name_kanji,
    br.name_romaji       AS brand_name_romaji,
    br.brewery_id        AS brand_brewery_id,
    br.source            AS brand_source,
    br.confidence        AS brand_confidence,
    b.brewery_id         AS brewery_brewery_id,
    b.name               AS brewery_name,
    b.name_kanji         AS brewery_name_kanji,
    b.name_romaji        AS brewery_name_romaji,
    b.area_id            AS brewery_area_id,
    b.source             AS brewery_source,
    b.confidence         AS brewery_confidence
  FROM brands br
  JOIN breweries b ON b.brewery_id = br.brewery_id
  WHERE br.name_kanji = ANY($1)
    AND br.superseded_at IS NULL
    AND b.superseded_at IS NULL
  ORDER BY br.brand_id
  LIMIT 2
`

// Third-pass: brewery kanji only — used when the first pass AND the
// brand-only second pass both return 0 rows. Real-world motivation
// (2026-06-11 testing): a Takashimizu bottle where the model
// returned a hallucinated brand `寺田` but read the brewery correctly
// as `高清水酒造`. Brand-only fallback missed (no Sakenowa brand is
// `寺田`); brewery-only fallback finds the Takashimizu line because
// the brewery exists. Mono-brand breweries match cleanly here;
// multi-brand breweries return 2+ rows and either route to the
// same-name preference (mono-brand main line) or ambiguous.
//
// The query returns every line of the brewery (LIMIT 60; the largest
// brewery in the mirror has 18), because the choices below — which line
// the read is part of, which is the brewery's namesake — are wrong if
// made on the first five. Only the list shown to the visitor is cut to
// `MAX_LIST_CANDIDATES`.
//
// ORDER BY puts the brand-name-equals-brewery-name row first when
// it exists. This is the "main brand" for mono-brand breweries
// like 沢の鶴 (Sakenowa Brand 2008 under Brewery 576, same name) —
// the visitor who scans a 沢の鶴 bottle expects to land on it, not
// the brewery's sub-line catalogue. LIMIT 5 gives us enough rows
// to detect "multiple same-name candidates" (would fall through to
// ambiguous) while staying bounded.
const SELECT_BRANDS_AND_BREWERIES_BY_BREWERY_KANJI = `
  SELECT
    br.brand_id          AS brand_brand_id,
    br.name              AS brand_name,
    br.name_kanji        AS brand_name_kanji,
    br.name_romaji       AS brand_name_romaji,
    br.brewery_id        AS brand_brewery_id,
    br.source            AS brand_source,
    br.confidence        AS brand_confidence,
    b.brewery_id         AS brewery_brewery_id,
    b.name               AS brewery_name,
    b.name_kanji         AS brewery_name_kanji,
    b.name_romaji        AS brewery_name_romaji,
    b.area_id            AS brewery_area_id,
    b.source             AS brewery_source,
    b.confidence         AS brewery_confidence
  FROM brands br
  JOIN breweries b ON b.brewery_id = br.brewery_id
  -- Spaces and parts as in the first pass.
  WHERE (
         b.name_kanji = ANY($1)
      OR regexp_replace(b.name_kanji, '[[:space:]　]+', '', 'g') = ANY($1)
      OR regexp_split_to_array(b.name_kanji, '[[:space:]　]+') && $1::text[]
    )
    AND br.superseded_at IS NULL
    AND b.superseded_at IS NULL
  ORDER BY
    (CASE WHEN br.name_kanji = b.name_kanji THEN 0 ELSE 1 END),
    br.brand_id
  LIMIT 60
`

// Latin brand lookup: matches against both Sakenowa's published `name`
// field (canonical romaji/Latin form for kanji brands, verbatim Latin
// for the ~110 Latin-only brands like `Shangri-la`, `I LOVE SUSHI`,
// `Highland`) AND our LLM-derived `name_romaji` column (populated by
// the #121 ingest pipeline for kanji brands like 黄桜 → "Kizakura").
//
// Used as a fallback after kanji/kana passes miss when the model
// returns a Latin-only brand string. The `name_romaji` reach is
// load-bearing for kanji brands the visitor scanned via the Latin
// transliteration on the label (real case: `Kizakura Perle` on a
// 黄桜 Perle bottle — Sakenowa stores `name = '黄桜'` but
// `name_romaji = 'Kizakura'`).
//
// Case-insensitive on both sides (LOWER() each).
//
// $1 is the candidate-set array — `expandLatinBrandVariants` may
// add the first-word stripping for multi-word inputs like
// `Kizakura Perle` → also try `Kizakura`. All candidates are
// pre-LOWER'd by the JS caller so the SQL only LOWERs the columns.
const SELECT_BRANDS_AND_BREWERIES_BY_LATIN_NAME = `
  SELECT
    br.brand_id          AS brand_brand_id,
    br.name              AS brand_name,
    br.name_kanji        AS brand_name_kanji,
    br.name_romaji       AS brand_name_romaji,
    br.brewery_id        AS brand_brewery_id,
    br.source            AS brand_source,
    br.confidence        AS brand_confidence,
    b.brewery_id         AS brewery_brewery_id,
    b.name               AS brewery_name,
    b.name_kanji         AS brewery_name_kanji,
    b.name_romaji        AS brewery_name_romaji,
    b.area_id            AS brewery_area_id,
    b.source             AS brewery_source,
    b.confidence         AS brewery_confidence
  FROM brands br
  JOIN breweries b ON b.brewery_id = br.brewery_id
  -- $2 holds the ids of the rows whose Latin name has the same romaji key as
  -- a candidate (see romaji-key.ts and romaji-index.ts): spacing, hyphens,
  -- long vowels and the romanisation system are compared away in one place,
  -- in TypeScript, rather than re-implemented here.
  WHERE (
         LOWER(br.name) = ANY($1::text[])
      OR LOWER(br.name_romaji) = ANY($1::text[])
      OR br.brand_id = ANY($2::int[])
    )
    AND br.superseded_at IS NULL
    AND b.superseded_at IS NULL
  ORDER BY br.brand_id
  LIMIT 5
`

/** How many sakes a "which of these?" list offers. */
const MAX_LIST_CANDIDATES = 5

interface BrandWithBreweryRow {
  brand_brand_id: number
  brand_name: string
  brand_name_kanji: string
  brand_name_romaji: string | null
  brand_brewery_id: number
  brand_source: BrandRow['source']
  brand_confidence: string | null
  brewery_brewery_id: number
  brewery_name: string
  brewery_name_kanji: string
  brewery_name_romaji: string | null
  brewery_area_id: number
  brewery_source: BreweryRow['source']
  brewery_confidence: string | null
}

function brandFromJoinedRow(row: BrandWithBreweryRow): Brand {
  return rowToBrand({
    brand_id: row.brand_brand_id,
    name: row.brand_name,
    name_kanji: row.brand_name_kanji,
    name_romaji: row.brand_name_romaji,
    brewery_id: row.brand_brewery_id,
    source: row.brand_source,
    confidence: row.brand_confidence,
  })
}

function breweryFromJoinedRow(row: BrandWithBreweryRow): Brewery {
  return rowToBrewery({
    brewery_id: row.brewery_brewery_id,
    name: row.brewery_name,
    name_kanji: row.brewery_name_kanji,
    name_romaji: row.brewery_name_romaji,
    area_id: row.brewery_area_id,
    source: row.brewery_source,
    confidence: row.brewery_confidence,
  })
}

export async function findSakeByExtractionFromPool(
  query: SakeLookupQuery,
  pool: Pool,
): Promise<FindSakeByExtractionResult> {
  // Brand and brewery variant expansion. Both passes compose:
  //   - kana-cross siblings (hiragana ↔ katakana — ~10 % of
  //     Sakenowa entries are kana-bearing)
  //   - kanji 旧字体 ↔ 新字体 variants (蔵王 ↔ 藏王)
  // Brewery additionally adds suffix expansion (`高清水` → `{高清水,
  // 高清水酒造, …}`) because the model drops operational suffixes
  // inconsistently. See `expandPossibleBrandVariants` and
  // `expandBreweryVariants`.
  const nameVariants = expandBrandVariants(query.nameJa)
  // Plus a renamed brewery's current name (旭酒造 → 獺祭, #387) — here only,
  // where the brand must match too; see `former-brewery-names.ts`.
  const breweryVariants = withFormerBreweryNames(expandBreweryVariants(query.breweryJa))
  debugAdd(
    'Sakenowa',
    `first-pass: querying brands WHERE name_kanji ∈ {${nameVariants.join('|')}} AND brewery.name_kanji ∈ {${breweryVariants.join('|')}}`,
    {
      nameJa: query.nameJa,
      breweryJa: query.breweryJa,
      nameVariants,
      breweryVariants,
    },
  )
  const { rows } = await publicQuery<BrandWithBreweryRow>(
    'brands',
    SELECT_BRANDS_BY_KANJI_EXTRACTION,
    [nameVariants, breweryVariants],
    pool,
  )
  debugAdd('Sakenowa', `first-pass returned ${rows.length} row(s)`)
  if (rows.length === 1) {
    return { kind: 'exact', sake: brandFromJoinedRow(rows[0]) }
  }
  if (rows.length >= 2) {
    return {
      kind: 'ambiguous',
      candidates: rows.map((r) => ({
        sake: brandFromJoinedRow(r),
        brewery: breweryFromJoinedRow(r),
      })),
      query,
    }
  }

  // First pass returned 0. A label often prints line and product as one
  // name (`勝山 縁`, `七賢 山ノ霞`) where the catalogue holds the line. Try
  // each part as the brand, still requiring the brewery to agree — that
  // agreement is what makes a part safe to match on.
  const lineVariants = expandBrandLineVariants(query.nameJa)
  if (lineVariants.length > 0) {
    debugAdd('Sakenowa', `first-pass missed; trying the name's parts {${lineVariants.join('|')}} with the same brewery`)
    const { rows: lineRows } = await publicQuery<BrandWithBreweryRow>(
      'brands',
      SELECT_BRANDS_BY_KANJI_EXTRACTION,
      [lineVariants, breweryVariants],
      pool,
    )
    if (lineRows.length === 1) {
      return { kind: 'exact', sake: brandFromJoinedRow(lineRows[0]) }
    }
    if (lineRows.length >= 2) {
      return {
        kind: 'ambiguous',
        candidates: lineRows.map((r) => ({ sake: brandFromJoinedRow(r), brewery: breweryFromJoinedRow(r) })),
        query,
      }
    }
  }

  // Still nothing, and the brand was read in Latin (DARUMA-MASAMUNE beside a
  // kanji brewery). The first pass compares kanji with kanji, so run its
  // rule on the Latin name: a row whose name matches in Latin AND whose
  // brewery is the one read is both fields agreeing.
  if (asLatinName(query.nameJa) !== null) {
    const byLatin = await findSakeByLatinBrandFromPool(query, pool)
    const candidates =
      byLatin.kind === 'matched_brand_only'
        ? [{ sake: byLatin.sake, brewery: byLatin.brewery }]
        : byLatin.kind === 'ambiguous'
          ? byLatin.candidates
          : []
    const agrees = (c: { brewery: Brewery }) => breweryKanjiAgrees(c.brewery.nameKanji, breweryVariants)
    let agreeing = collapseSameReading(candidates.filter(agrees))
    if (agreeing.length === 0) {
      // Nothing as spelled; voicing ignored, the brewery still has to agree.
      agreeing = collapseSameReading((await listBrandsByLooseLatinName(query.nameJa, pool)).filter(agrees))
    }
    if (agreeing.length === 1) {
      debugAdd('Sakenowa', `Latin name and kanji brewery both match "${agreeing[0].sake.nameKanji}"`)
      return { kind: 'exact', sake: agreeing[0].sake }
    }
  }

  // First pass returned 0. Delegate to the brand-only second pass
  // (also reachable from scan-action.ts when a field-swap is
  // suspected).
  const brandOnly = await findSakeByBrandOnlyFromPool(query, pool)
  if (brandOnly.kind !== 'no_match') return brandOnly

  // Brand-only fallback returned 0. Delegate to the brewery-only
  // third pass — also reachable on its own from scan-action.ts when
  // the single-character-hallucination guard fires (brand suspect,
  // brewery still worth a shot).
  const breweryOnly = await findSakeByBreweryOnlyFromPool(query, pool)
  if (breweryOnly.kind === 'matched_brewery_only') return breweryOnly

  // brewery-only returned ambiguous OR no_match. If ambiguous AND
  // `name_ja` is Latin-shaped, the model's brewery may have been
  // misread (e.g. 2026-06-13 Kizakura Perle bottle: model returned
  // brewery `木下酒造` which IS in Sakenowa with 5 brands, but the
  // real brewery is `黄桜` and the real brand `黄桜` has
  // name_romaji = 'Kizakura'). We try the 5th-pass Latin lookup
  // BEFORE returning the brewery-only ambiguous, because a unique
  // Latin match is almost certainly more accurate than a list of
  // candidates from a brewery the model may not even have read
  // correctly.
  //
  // Decision tree on brewery-only result × Latin pass eligibility:
  //   - matched_brewery_only      → return (already short-circuited above)
  //   - ambiguous + Latin runs + matched_brand_only result → prefer Latin
  //   - ambiguous + Latin runs + non-match result → fall back to brewery-only ambiguous
  //   - ambiguous + Latin doesn't run → return brewery-only ambiguous
  //   - no_match → fall through to field-swap pass below
  if (breweryOnly.kind === 'ambiguous') {
    if (asLatinName(query.nameJa) !== null) {
      debugAdd(
        'Sakenowa',
        `brewery-only returned ambiguous; name_ja is Latin-shaped → trying Latin pass before falling back`,
      )
      const latinFromAmbig = await findSakeByLatinBrandFromPool(query, pool)
      if (latinFromAmbig.kind === 'matched_brand_only') {
        debugAdd(
          'Sakenowa',
          `Latin pass found a unique match (${latinFromAmbig.sake.nameKanji}); preferring it over brewery-only ambiguous`,
        )
        return latinFromAmbig
      }
    }
    return breweryOnly
  }

  // Fourth pass: field-swap rescue at the general-lookup level.
  // 2026-06-12 trace on a `杉玉` (Sugitama) bottle: model returned
  // `name_ja: '崇麗'` (junk) and `brewery_ja: '杉玉酒造'` — the brand
  // with `酒造` appended. The first three passes all miss because
  // `杉玉酒造` isn't a brewery (`杉玉` is a brand). Treating the
  // brewery_ja value AS the brand name lets `findSakeByBrandOnly`
  // find brand 14 via `expandPossibleBrandVariants` (which strips
  // the operational suffix, so `杉玉酒造` → also tries `杉玉`).
  //
  // The single-char rescue path in scan-action.ts already does this
  // for the brand-is-junk case (`name_ja.length === 1`); this 4th
  // pass extends the same logic to extractions where the brand
  // looks plausible but is also wrong (rice variety, season label,
  // hallucination of 2+ chars).
  //
  // Result query is re-echoed to the original so callers see the
  // visitor's actual brewery_ja in the divergence, not the swapped
  // value (which happens to be identical here but the rewrite is
  // explicit for clarity).
  //
  // Short-circuit: when `name_ja === brewery_ja` (the model's "total
  // surrender" shape from §21 — same string in both fields), the
  // 4th-pass query is byte-identical to the step-2 brand-only call
  // that already returned no rows. Save the round-trip.
  if (query.nameJa !== query.breweryJa) {
    debugAdd(
      'Sakenowa',
      `brewery-only missed; trying field-swap (brand-only on brewery_ja "${query.breweryJa}")`,
    )
    const fieldSwap = await findSakeByBrandOnlyFromPool(
      { nameJa: query.breweryJa, breweryJa: query.breweryJa },
      pool,
    )
    if (fieldSwap.kind === 'matched_brand_only' || fieldSwap.kind === 'ambiguous') {
      return { ...fieldSwap, query }
    }
  } else {
    debugAdd(
      'Sakenowa',
      'skipping field-swap pass — name_ja === brewery_ja so the lookup would re-issue the brand-only query that already missed',
    )
  }

  // Fifth pass: Latin-name brand lookup. The four kanji + kana
  // passes have all missed; if `name_ja` is Latin-shaped (e.g.
  // `UMAMI`, `Highland`, `Shangri-la`) the bottle may be one of
  // Sakenowa's 110 Latin-only brands or a kanji brand whose model
  // output landed in romaji. Case-insensitive match against
  // `brands.name`.
  if (asLatinName(query.nameJa) !== null) {
    debugAdd('Sakenowa', `kanji + kana passes missed; trying Latin-name lookup on "${query.nameJa}"`)
    const latinMatch = await findSakeByLatinBrandFromPool(query, pool)
    if (latinMatch.kind === 'matched_brand_only' || latinMatch.kind === 'ambiguous') {
      return latinMatch
    }
  }

  return { kind: 'no_match', query }
}


/**
 * Brand-only fallback as a standalone seam. Real-world use cases:
 *
 * - Issue [#123] brewery-hallucination shape: model returns the right
 *   brand kanji but an invented brewery. Brand-only finds the
 *   unique row and surfaces the brewery divergence.
 *
 * - 2026-06-11 Takashimizu field-swap shape: model puts the BRAND
 *   in the brewery field because the brand is the prominent kanji
 *   on the label. Scan-action calls this with `nameJa =
 *   extraction.brewery_ja` to try interpreting the brewery field
 *   AS the brand. If 1 row → we know what bottle this is even
 *   though the model labelled the fields wrong.
 *
 * Returns a strict subset of `FindSakeByExtractionResult`. Callers
 * union-narrow with `matched_brand_only | ambiguous | no_match`.
 */
export type BrandOnlyLookupResult = Extract<
  FindSakeByExtractionResult,
  { kind: 'matched_brand_only' } | { kind: 'ambiguous' } | { kind: 'no_match' }
>

export async function findSakeByBrandOnlyFromPool(
  query: SakeLookupQuery,
  pool: Pool,
): Promise<BrandOnlyLookupResult> {
  // `expandPossibleBrandVariants` adds the stem if the input ends
  // with an operational suffix — so `高清水酒造` also tries
  // `高清水`. Real Sakenowa brand names don't carry operational
  // suffixes; this catches the scan-action field-swap case where
  // the model put a brand-with-suffix in the brewery field, and
  // any general "brand-shaped-as-brewery" misread.
  const nameVariants = expandPossibleBrandVariants(query.nameJa)
  debugAdd(
    'Sakenowa',
    `brand-only lookup on name_kanji ∈ {${nameVariants.join('|')}}`,
    { nameJa: query.nameJa, nameVariants },
  )
  const { rows } = await publicQuery<BrandWithBreweryRow>(
    'brands',
    SELECT_BRANDS_AND_BREWERIES_BY_BRAND_KANJI,
    [nameVariants],
    pool,
  )
  debugAdd('Sakenowa', `brand-only lookup returned ${rows.length} row(s)`)

  if (rows.length === 0) return { kind: 'no_match', query }
  if (rows.length === 1) {
    const matched = rows[0]
    const brand = brandFromJoinedRow(matched)
    const brewery = breweryFromJoinedRow(matched)
    return {
      kind: 'matched_brand_only',
      sake: brand,
      brewery,
      breweryDivergence: {
        extracted: query.breweryJa,
        stored: brewery.nameKanji,
      },
      query,
    }
  }
  return {
    kind: 'ambiguous',
    candidates: rows.map((r) => ({
      sake: brandFromJoinedRow(r),
      brewery: breweryFromJoinedRow(r),
    })),
    query,
  }
}

export async function findSakeByBrandOnly(
  query: SakeLookupQuery,
): Promise<BrandOnlyLookupResult> {
  return findSakeByBrandOnlyFromPool(query, getServerDbPool())
}


/**
 * Latin-name brand lookup. Matches against BOTH the Sakenowa
 * `brands.name` field (canonical Latin form, e.g. `Shangri-la`,
 * `UMAMI`) AND the LLM-derived `brands.name_romaji` column
 * (populated by the #121 ingest pipeline — kanji brands get a
 * Latin transliteration there, so `黄桜` ↔ `Kizakura`).
 *
 * Used when the visitor's bottle presents the brand in Latin
 * script — either a genuinely Latin-only brand (one of the ~110
 * in Sakenowa) or a Latin transliteration of a kanji brand the
 * visitor's eye latched onto.
 *
 * Returns the same `BrandOnlyLookupResult` shape as the kanji
 * brand-only lookup so callers can chain them transparently. The
 * divergence card pre-populates `breweryDivergence.extracted` with
 * the *original* `query.breweryJa` so the visitor sees what the
 * model put in the brewery field even when the brand was matched
 * via the Latin column.
 */
export async function findSakeByLatinBrandFromPool(
  query: SakeLookupQuery,
  pool: Pool,
): Promise<BrandOnlyLookupResult> {
  const candidates = expandLatinBrandVariants(asLatinName(query.nameJa) ?? '')
  if (candidates.length === 0) return { kind: 'no_match', query }
  debugAdd(
    'Sakenowa',
    `latin-name lookup on LOWER(name) OR LOWER(name_romaji) ∈ {${candidates.join('|')}}`,
    { nameJa: query.nameJa, candidates },
  )
  const { rows } = await publicQuery<BrandWithBreweryRow>(
    'brands',
    SELECT_BRANDS_AND_BREWERIES_BY_LATIN_NAME,
    // Other names it is sold under count as Latin names here (#413): the
    // result is still `matched_brand_only`, so it needs the same second
    // witness a romaji match needs.
    [candidates, (await getRomajiIndex(pool)).brandIdsNamed(candidates.map(romajiKey), { withAliases: true })],
    pool,
  )
  debugAdd('Sakenowa', `latin-name lookup returned ${rows.length} row(s)`)

  if (rows.length === 0) return { kind: 'no_match', query }
  if (rows.length === 1) {
    const matched = rows[0]
    const brand = brandFromJoinedRow(matched)
    const brewery = breweryFromJoinedRow(matched)
    return {
      kind: 'matched_brand_only',
      sake: brand,
      brewery,
      breweryDivergence: {
        extracted: query.breweryJa,
        stored: brewery.nameKanji,
      },
      query,
    }
  }
  return {
    kind: 'ambiguous',
    candidates: rows.map((r) => ({
      sake: brandFromJoinedRow(r),
      brewery: breweryFromJoinedRow(r),
    })),
    query,
  }
}

const SELECT_BRANDS_AND_BREWERIES_BY_IDS = `
  SELECT
    br.brand_id          AS brand_brand_id,
    br.name              AS brand_name,
    br.name_kanji        AS brand_name_kanji,
    br.name_romaji       AS brand_name_romaji,
    br.brewery_id        AS brand_brewery_id,
    br.source            AS brand_source,
    br.confidence        AS brand_confidence,
    b.brewery_id         AS brewery_brewery_id,
    b.name               AS brewery_name,
    b.name_kanji         AS brewery_name_kanji,
    b.name_romaji        AS brewery_name_romaji,
    b.area_id            AS brewery_area_id,
    b.source             AS brewery_source,
    b.confidence         AS brewery_confidence
  FROM brands br
  JOIN breweries b ON b.brewery_id = br.brewery_id
  WHERE br.brand_id = ANY($1::int[])
    AND br.superseded_at IS NULL
    AND b.superseded_at IS NULL
  ORDER BY br.brand_id
  LIMIT 20
`

/**
 * Sakes whose Latin name matches with voicing ignored ({@link looseRomajiKey}).
 * Candidates only — a caller must have other evidence before using one.
 */
async function listBrandsByLooseLatinName(
  nameJa: string,
  pool: Pool,
): Promise<{ sake: Brand; brewery: Brewery }[]> {
  const latin = asLatinName(nameJa)
  if (latin === null) return []
  const keys = [...new Set(expandLatinBrandVariants(latin).map(looseRomajiKey))].filter((k) => k.length >= 4)
  const ids = (await getRomajiIndex(pool)).brandIdsNamed(keys, { loose: true })
  if (ids.length === 0) return []
  const { rows } = await publicQuery<BrandWithBreweryRow>('brands', SELECT_BRANDS_AND_BREWERIES_BY_IDS, [ids], pool)
  return rows.map((r) => ({ sake: brandFromJoinedRow(r), brewery: breweryFromJoinedRow(r) }))
}

export async function findSakeByLatinBrand(
  query: SakeLookupQuery,
): Promise<BrandOnlyLookupResult> {
  return findSakeByLatinBrandFromPool(query, getServerDbPool())
}

// Brewery by its Latin name — for a label that names the maker in Latin
// only, which is every importer's back label in the EU. Compared with the
// LLM-derived `breweries.name_romaji` (97 % of rows have one). Same
// ordering and bound as the kanji brewery-only pass.
const SELECT_BRANDS_AND_BREWERIES_BY_BREWERY_ROMAJI = `
  SELECT
    br.brand_id          AS brand_brand_id,
    br.name              AS brand_name,
    br.name_kanji        AS brand_name_kanji,
    br.name_romaji       AS brand_name_romaji,
    br.brewery_id        AS brand_brewery_id,
    br.source            AS brand_source,
    br.confidence        AS brand_confidence,
    b.brewery_id         AS brewery_brewery_id,
    b.name               AS brewery_name,
    b.name_kanji         AS brewery_name_kanji,
    b.name_romaji        AS brewery_name_romaji,
    b.area_id            AS brewery_area_id,
    b.source             AS brewery_source,
    b.confidence         AS brewery_confidence
  FROM brands br
  JOIN breweries b ON b.brewery_id = br.brewery_id
  WHERE b.brewery_id = ANY($1::int[])
    AND br.superseded_at IS NULL
    AND b.superseded_at IS NULL
  ORDER BY
    (CASE WHEN br.name_kanji = b.name_kanji THEN 0 ELSE 1 END),
    br.brand_id
  LIMIT 60
`


/**
 * The lookup for a label whose brewery was read in Latin script.
 *
 * Kanji brewery names cannot be compared with it, so the brand leads: by
 * kanji or kana when the brand was read in Japanese script, by Latin name
 * otherwise. The Latin brewery then does what the kanji brewery does in the
 * first pass — where it agrees with the stored romaji of exactly one
 * candidate, both fields have matched one row and the result is `exact`.
 * Where the brand finds nothing, the brewery's romaji alone may still name a
 * one-line brewery.
 */
export async function findSakeByLatinBreweryFromPool(
  query: SakeLookupQuery,
  pool: Pool,
): Promise<FindSakeByExtractionResult> {
  // Kanji and kana names are looked up as written first; a kana name that
  // is no row's name is then sounded out and compared with the romaji.
  const nameIsLatin = containsLatinAlpha(query.nameJa) && !containsJapaneseScript(query.nameJa)
  let byBrand = nameIsLatin
    ? await findSakeByLatinBrandFromPool(query, pool)
    : await findSakeByBrandOnlyFromPool(query, pool)
  if (byBrand.kind === 'no_match' && !nameIsLatin && asLatinName(query.nameJa) !== null) {
    byBrand = await findSakeByLatinBrandFromPool(query, pool)
  }

  if (byBrand.kind === 'matched_brand_only') {
    return latinBreweryAgrees(query.breweryJa, byBrand.brewery.nameRomaji ?? null)
      ? { kind: 'exact', sake: byBrand.sake }
      : byBrand
  }
  if (byBrand.kind === 'ambiguous') {
    const agreeing = collapseSameReading(
      byBrand.candidates.filter((c) => latinBreweryAgrees(query.breweryJa, c.brewery.nameRomaji ?? null)),
    )
    return agreeing.length === 1 ? { kind: 'exact', sake: agreeing[0].sake } : byBrand
  }

  // The brand found nothing as spelled. Try it with voicing ignored
  // (`Taruzake` for a stored `Tarusake`) — acceptable only because the
  // brewery has to agree as well.
  const voiced = collapseSameReading(
    (await listBrandsByLooseLatinName(query.nameJa, pool)).filter((c) =>
      latinBreweryAgrees(query.breweryJa, c.brewery.nameRomaji ?? null),
    ),
  )
  if (voiced.length === 1) return { kind: 'exact', sake: voiced[0].sake }

  const candidates = latinBreweryCandidates(query.breweryJa)
  if (candidates.length === 0) return { kind: 'no_match', query }
  debugAdd('Sakenowa', `brand missed; brewery-by-romaji lookup on {${candidates.join('|')}}`)
  const breweryIds = (await getRomajiIndex(pool)).breweryIdsNamed(candidates)
  if (breweryIds.length === 0) return { kind: 'no_match', query }
  const { rows } = await publicQuery<BrandWithBreweryRow>(
    'brands',
    SELECT_BRANDS_AND_BREWERIES_BY_BREWERY_ROMAJI,
    [breweryIds],
    pool,
  )
  if (rows.length === 0) return { kind: 'no_match', query }
  if (rows.length === 1) {
    const brand = brandFromJoinedRow(rows[0])
    return {
      kind: 'matched_brewery_only',
      sake: brand,
      brewery: breweryFromJoinedRow(rows[0]),
      brandDivergence: { extracted: query.nameJa, stored: brand.nameKanji },
      query,
    }
  }
  return {
    kind: 'ambiguous',
    candidates: rows
      .slice(0, MAX_LIST_CANDIDATES)
      .map((r) => ({ sake: brandFromJoinedRow(r), brewery: breweryFromJoinedRow(r) })),
    query,
  }
}

/**
 * Brewery-only fallback as a standalone seam. Used as the third pass
 * of `findSakeByExtractionFromPool` AND as a direct call from
 * scan-action.ts when the single-character-hallucination guard fires
 * — the brand is likely junk, but if the brewery is real and
 * mono-brand, we can still resolve to the right sake.
 *
 * Returns a strict subset of `FindSakeByExtractionResult` — the
 * exact / matched_brand_only arms aren't reachable through this
 * function. Callers union-narrow with that in mind.
 */
export type BreweryOnlyLookupResult = Extract<
  FindSakeByExtractionResult,
  { kind: 'matched_brewery_only' } | { kind: 'ambiguous' } | { kind: 'no_match' }
>

export async function findSakeByBreweryOnlyFromPool(
  query: SakeLookupQuery,
  pool: Pool,
): Promise<BreweryOnlyLookupResult> {
  // Same composed expansion as the first-pass — kanji-variant +
  // operational-suffix — so a model that returned `高清水` (no
  // 酒造) still finds the stored `高清水酒造`.
  const breweryVariants = expandBreweryVariants(query.breweryJa)
  debugAdd(
    'Sakenowa',
    `brewery-only lookup on brewery.name_kanji ∈ {${breweryVariants.join('|')}}`,
    { breweryJa: query.breweryJa, breweryVariants },
  )
  const { rows: breweryOnlyRows } = await publicQuery<BrandWithBreweryRow>(
    'brands',
    SELECT_BRANDS_AND_BREWERIES_BY_BREWERY_KANJI,
    [breweryVariants],
    pool,
  )
  debugAdd('Sakenowa', `brewery-only lookup returned ${breweryOnlyRows.length} row(s)`)

  if (breweryOnlyRows.length === 0) {
    return { kind: 'no_match', query }
  }
  if (breweryOnlyRows.length === 1) {
    const matched = breweryOnlyRows[0]
    const brand = brandFromJoinedRow(matched)
    const brewery = breweryFromJoinedRow(matched)
    return {
      kind: 'matched_brewery_only',
      sake: brand,
      brewery,
      brandDivergence: {
        extracted: query.nameJa,
        stored: brand.nameKanji,
      },
      query,
    }
  }

  // 2+ brands under this brewery. If the brand that was read is part of
  // exactly one of their names, that is the bottle: the read is short of
  // the stored name, so it stays a divergence the visitor confirms.
  const overlapping = namesOverlapping(
    query.nameJa,
    breweryOnlyRows.map((r) => r.brand_name_kanji),
  )
  if (overlapping.length === 1) {
    const matched = breweryOnlyRows[overlapping[0]]
    const brand = brandFromJoinedRow(matched)
    debugAdd('Sakenowa', `brewery-only found ${breweryOnlyRows.length} brands; "${query.nameJa}" is part of only "${brand.nameKanji}"`)
    return {
      kind: 'matched_brewery_only',
      sake: brand,
      brewery: breweryFromJoinedRow(matched),
      brandDivergence: { extracted: query.nameJa, stored: brand.nameKanji },
      query,
    }
  }

  // The read is the brewery's own name without its suffix (世嬉の一 under
  // 世嬉の一酒造), and one line is named after the brewery in Latin where the
  // catalogue writes it in another script (せきのいち, "Sekinoichi").
  const stem = stripOperationalSuffix(breweryOnlyRows[0].brewery_name_kanji)
  if (stem !== null && expandBrandVariants(query.nameJa).includes(stem)) {
    const breweryKey = latinBreweryCore(breweryOnlyRows[0].brewery_name_romaji ?? '').join('')
    const namesakes = breweryOnlyRows.filter(
      (r) => breweryKey.length > 0 && r.brand_name_romaji !== null && romajiKey(r.brand_name_romaji) === breweryKey,
    )
    if (namesakes.length === 1) {
      const brand = brandFromJoinedRow(namesakes[0])
      debugAdd('Sakenowa', `"${query.nameJa}" is the brewery's own name; its namesake line is "${brand.nameKanji}"`)
      return {
        kind: 'matched_brewery_only',
        sake: brand,
        brewery: breweryFromJoinedRow(namesakes[0]),
        brandDivergence: { extracted: query.nameJa, stored: brand.nameKanji },
        query,
      }
    }
  }

  // Otherwise prefer the row where the brand
  // shares the brewery's kanji — the "main brand" for mono-brand
  // breweries (沢の鶴, Brewery 576 / Brand 2008 in Sakenowa; same
  // pattern for 賀茂泉, 大七, plenty of others). The SQL ORDER BY
  // puts same-name rows first, so we check rows[0] and confirm
  // it's *the only* same-name candidate before promoting. If two
  // breweries with the same kanji each have a same-name main
  // brand the lookup correctly falls through to ambiguous (the
  // visitor needs to disambiguate which brewery).
  const sameNameRows = breweryOnlyRows.filter(
    (r) => r.brand_name_kanji === r.brewery_name_kanji,
  )
  if (sameNameRows.length === 1) {
    const matched = sameNameRows[0]
    const brand = brandFromJoinedRow(matched)
    const brewery = breweryFromJoinedRow(matched)
    debugAdd(
      'Sakenowa',
      `brewery-only found ${breweryOnlyRows.length} brands; promoting the same-name main "${brand.nameKanji}" (mono-brand preference)`,
    )
    return {
      kind: 'matched_brewery_only',
      sake: brand,
      brewery,
      brandDivergence: {
        extracted: query.nameJa,
        stored: brand.nameKanji,
      },
      query,
    }
  }

  return {
    kind: 'ambiguous',
    candidates: breweryOnlyRows.slice(0, MAX_LIST_CANDIDATES).map((r) => ({
      sake: brandFromJoinedRow(r),
      brewery: breweryFromJoinedRow(r),
    })),
    query,
  }
}

export async function findSakeByBreweryOnly(
  query: SakeLookupQuery,
): Promise<BreweryOnlyLookupResult> {
  return findSakeByBreweryOnlyFromPool(query, getServerDbPool())
}

export async function findSakeByExtraction(
  query: SakeLookupQuery,
): Promise<FindSakeByExtractionResult> {
  return findSakeByExtractionFromPool(query, getServerDbPool())
}
