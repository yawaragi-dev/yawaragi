import 'server-only'
import type { Pool } from 'pg'
import { debugAdd } from '@/lib/debug/debug-log'
import type { Brand } from '../schemas/brand'
import type { Brewery } from '../schemas/brewery'
import type { FlavorChart } from '../schemas/flavor-chart'
import type { Ranking, RankingKind } from '../schemas/ranking'
import {
  type BrandRow,
  type BreweryRow,
  type FlavorChartRow,
  type RankingRow,
  rowToBrand,
  rowToBrewery,
  rowToFlavorChart,
  rowToRanking,
} from './db'
import {
  expandBrandVariants,
  expandBreweryVariants,
  expandPossibleBrandVariants,
} from './brewery-variants'
import { publicQuery } from '../supabase/public-query'
import { getServerDbPool } from '../supabase/server-client'

// All read queries filter `superseded_at IS NULL` so manual_curation
// rows superseded by a later Sakenowa publish disappear from the
// public read path while remaining in the table for audit. ADR-0014.
const SELECT_BRAND_BY_ID = `
  SELECT brand_id, name, name_kanji, name_romaji, brewery_id, source, confidence
  FROM brands
  WHERE brand_id = $1 AND superseded_at IS NULL
`

export async function lookupBrandFromPool(brandId: number, pool: Pool): Promise<Brand | null> {
  const { rows } = await publicQuery<BrandRow>('brands', SELECT_BRAND_BY_ID, [brandId], pool)
  if (rows.length === 0) return null
  return rowToBrand(rows[0])
}

/**
 * Read-side helper. Server-only. Server components and route handlers call
 * this; tests should use `lookupBrandFromPool(brandId, testcontainerPool)`
 * instead so they don't depend on a `DATABASE_URL` env var.
 */
export async function lookupBrand(brandId: number): Promise<Brand | null> {
  return lookupBrandFromPool(brandId, getServerDbPool())
}

// JOIN-via-brand so the public contract stays brand-keyed (the page has a
// brandId; it shouldn't need to know the brewery_id to fetch a brewery).
const SELECT_BREWERY_BY_BRAND_ID = `
  SELECT b.brewery_id, b.name, b.name_kanji, b.name_romaji, b.area_id, b.source, b.confidence
  FROM breweries b
  JOIN brands br ON br.brewery_id = b.brewery_id
  WHERE br.brand_id = $1
    AND b.superseded_at IS NULL
    AND br.superseded_at IS NULL
`

export async function lookupBreweryByBrandFromPool(
  brandId: number,
  pool: Pool,
): Promise<Brewery | null> {
  const { rows } = await publicQuery<BreweryRow>(
    'breweries',
    SELECT_BREWERY_BY_BRAND_ID,
    [brandId],
    pool,
  )
  if (rows.length === 0) return null
  return rowToBrewery(rows[0])
}

export async function lookupBreweryByBrand(brandId: number): Promise<Brewery | null> {
  return lookupBreweryByBrandFromPool(brandId, getServerDbPool())
}

const SELECT_FLAVOR_CHART_BY_BRAND_ID = `
  SELECT brand_id, f1, f2, f3, f4, f5, f6, source, confidence
  FROM flavor_charts
  WHERE brand_id = $1
`

export async function lookupFlavorChartFromPool(
  brandId: number,
  pool: Pool,
): Promise<FlavorChart | null> {
  const { rows } = await publicQuery<FlavorChartRow>(
    'flavor_charts',
    SELECT_FLAVOR_CHART_BY_BRAND_ID,
    [brandId],
    pool,
  )
  if (rows.length === 0) return null
  return rowToFlavorChart(rows[0])
}

export async function lookupFlavorChart(brandId: number): Promise<FlavorChart | null> {
  return lookupFlavorChartFromPool(brandId, getServerDbPool())
}

// listRanking returns the top-N rows for a single ranking scope. For
// kind='area' the caller must pass `areaId`; for kind='overall' the
// scope is implicit (one global list per ADR-0002).
export interface ListRankingArgs {
  kind: RankingKind
  limit: number
  areaId?: number
}

const LIST_RANKING_OVERALL = `
  SELECT kind, area_id, rank, brand_id, score, source, confidence
  FROM rankings
  WHERE kind = 'overall'
  ORDER BY rank ASC
  LIMIT $1
`

const LIST_RANKING_AREA = `
  SELECT kind, area_id, rank, brand_id, score, source, confidence
  FROM rankings
  WHERE kind = 'area' AND area_id = $1
  ORDER BY rank ASC
  LIMIT $2
`

export async function listRankingFromPool(
  args: ListRankingArgs,
  pool: Pool,
): Promise<Ranking[]> {
  if (args.limit <= 0) return []
  if (args.kind === 'overall') {
    const { rows } = await publicQuery<RankingRow>(
      'rankings',
      LIST_RANKING_OVERALL,
      [args.limit],
      pool,
    )
    return rows.map(rowToRanking)
  }
  if (args.areaId === undefined) {
    throw new Error("listRanking: kind='area' requires an areaId")
  }
  const { rows } = await publicQuery<RankingRow>(
    'rankings',
    LIST_RANKING_AREA,
    [args.areaId, args.limit],
    pool,
  )
  return rows.map(rowToRanking)
}

export async function listRanking(args: ListRankingArgs): Promise<Ranking[]> {
  return listRankingFromPool(args, getServerDbPool())
}

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
  WHERE br.name_kanji = ANY($1) AND b.name_kanji = ANY($2)
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
  WHERE b.name_kanji = ANY($1)
    AND br.superseded_at IS NULL
    AND b.superseded_at IS NULL
  ORDER BY
    (CASE WHEN br.name_kanji = b.name_kanji THEN 0 ELSE 1 END),
    br.brand_id
  LIMIT 5
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
  WHERE (LOWER(br.name) = ANY($1::text[]) OR LOWER(br.name_romaji) = ANY($1::text[]))
    AND br.superseded_at IS NULL
    AND b.superseded_at IS NULL
  ORDER BY br.brand_id
  LIMIT 5
`

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
  const breweryVariants = expandBreweryVariants(query.breweryJa)
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
    if (containsLatinAlpha(query.nameJa) && !containsJapaneseScript(query.nameJa)) {
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
  if (containsLatinAlpha(query.nameJa) && !containsJapaneseScript(query.nameJa)) {
    debugAdd('Sakenowa', `kanji + kana passes missed; trying Latin-name lookup on "${query.nameJa}"`)
    const latinMatch = await findSakeByLatinBrandFromPool(query, pool)
    if (latinMatch.kind === 'matched_brand_only' || latinMatch.kind === 'ambiguous') {
      return latinMatch
    }
  }

  return { kind: 'no_match', query }
}

const JAPANESE_SCRIPT_REGEX_LOOKUP = /[぀-ゟ゠-ヿ一-鿿]/
const LATIN_ALPHA_REGEX = /[A-Za-z]/

function containsJapaneseScript(value: string): boolean {
  return JAPANESE_SCRIPT_REGEX_LOOKUP.test(value)
}

function containsLatinAlpha(value: string): boolean {
  return LATIN_ALPHA_REGEX.test(value)
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
 * actually query. Three transforms:
 *   - Verbatim (lowercased).
 *   - For multi-word inputs where the first word is substantial
 *     (≥ 4 characters) AND NOT in `SAKE_GRADE_TOKENS`, also try the
 *     first word alone. Catches `Kizakura Perle` → also try
 *     `Kizakura`. The grade-token guard prevents
 *     `JUNMAI TARU SAKE` → `junmai` matching unrelated brands.
 *   - Space-stripped form for `name_romaji` (which the #121 ingest
 *     pipeline stores as single-word camel Latin like `Tanigawadake`).
 *
 * Returns lowercased strings so the SQL only has to LOWER() each
 * column on the right-hand side.
 */
export function expandLatinBrandVariants(text: string): string[] {
  const trimmed = text.trim()
  if (trimmed.length === 0) return []
  const lower = trimmed.toLowerCase()
  const variants = new Set<string>([lower])
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
  return [...variants]
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
  const candidates = expandLatinBrandVariants(query.nameJa)
  if (candidates.length === 0) return { kind: 'no_match', query }
  debugAdd(
    'Sakenowa',
    `latin-name lookup on LOWER(name) OR LOWER(name_romaji) ∈ {${candidates.join('|')}}`,
    { nameJa: query.nameJa, candidates },
  )
  const { rows } = await publicQuery<BrandWithBreweryRow>(
    'brands',
    SELECT_BRANDS_AND_BREWERIES_BY_LATIN_NAME,
    [candidates],
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

export async function findSakeByLatinBrand(
  query: SakeLookupQuery,
): Promise<BrandOnlyLookupResult> {
  return findSakeByLatinBrandFromPool(query, getServerDbPool())
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

  // 2+ brands under this brewery. Prefer the row where the brand
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
    candidates: breweryOnlyRows.map((r) => ({
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
