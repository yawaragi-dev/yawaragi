import 'server-only'
import type { Pool } from 'pg'
import type { Brand } from '@/lib/schemas/brand'
import { type BrandRow, rowToBrand } from '@/lib/sakenowa/db'
import { publicQuery } from '@/lib/supabase/public-query'
import { getServerDbPool } from '@/lib/supabase/server-client'

/**
 * Minimal deterministic sake search (P5.5-C2b, #244) — the picker behind the
 * journal "Log a sake" form (ADR-0020). No LLM, no ranking model: a
 * case-insensitive substring match over a brand's name / kanji / romaji, read
 * pg-direct from the public `brands` mirror (ADR-0010).
 *
 * This is the deliberately-small first cut of the wider search surface (#234);
 * the log form only needs "type a name, pick the sake". It stays a plain
 * `*From Pool` + convenience pair like the other Sakenowa read helpers so the
 * query is integration-tested against real Postgres.
 *
 * Only brands that HAVE a FlavorChart are returned (the INNER JOIN): the journal
 * can only place a sake in axis space if it has one, so `logSakeToJournal` would
 * otherwise skip a chartless pick — surfacing it in the picker would be a dead
 * end. Filtering here means every pick is loggable.
 */
export const MAX_BRAND_SEARCH_RESULTS = 10

/**
 * Escape LIKE metacharacters (`%`, `_`, and the escape char itself) so a
 * user-typed `%` matches a literal percent sign rather than "any run of
 * characters". The value is still passed as a bound parameter — this is about
 * match semantics, not injection.
 */
export function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

const SEARCH_BRANDS = `
  SELECT b.brand_id, b.name, b.name_kanji, b.name_romaji, b.brewery_id, b.source, b.confidence
  FROM brands b
  JOIN flavor_charts fc ON fc.brand_id = b.brand_id
  WHERE b.superseded_at IS NULL
    AND (b.name ILIKE $1 OR b.name_kanji ILIKE $1 OR b.name_romaji ILIKE $1)
  ORDER BY char_length(b.name) ASC, b.name ASC
  LIMIT $2
`

export async function searchBrandsFromPool(
  query: string,
  pool: Pool,
  limit: number = MAX_BRAND_SEARCH_RESULTS,
): Promise<Brand[]> {
  const trimmed = query.trim()
  if (trimmed.length === 0) return []
  const pattern = `%${escapeLikePattern(trimmed)}%`
  const capped = Math.min(Math.max(1, Math.trunc(limit)), MAX_BRAND_SEARCH_RESULTS)
  const { rows } = await publicQuery<BrandRow>('brands', SEARCH_BRANDS, [pattern, capped], pool)
  return rows.map(rowToBrand)
}

/**
 * App-facing read helper. Server-only. Tests use `searchBrandsFromPool(query,
 * testcontainerPool)` so they don't depend on a `DATABASE_URL` env var.
 */
export async function searchBrands(query: string, limit?: number): Promise<Brand[]> {
  return searchBrandsFromPool(query, getServerDbPool(), limit)
}

/**
 * ─────────────────────────────────────────────────────────────────────────
 * §8 Search ("Type it") — the visitor-facing surface
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The helpers above are the journal's picker (#244): charted brands only,
 * name fields only, ten rows, behind a maintainer gate. §8 is the public
 * search, and it wants three things that picker deliberately does not:
 *
 * - **Brewery in the match.** §8 "searches name, kana, brewery"; a visitor who
 *   remembers 旭酒造 but not 獺祭 has to be able to get there.
 * - **Chartless brands included.** The picker's INNER JOIN on `flavor_charts`
 *   is load-bearing for it — `logSakeToJournal` cannot place a chartless sake
 *   in axis space, so offering one would be a dead end. §8's rows go to the
 *   bottle page, which renders a "no chart yet" state perfectly well, and
 *   ADR-0016 records that about half the catalogue has no chart. Applying the
 *   picker's filter here would hide half the catalogue from search, which is
 *   the opposite of the point.
 * - **Twenty rows, not ten**, and the brewery columns the row renders.
 *
 * So: two queries over one table, each honest about its own contract, sharing
 * {@link escapeLikePattern}. Merging them behind a flag would make the
 * picker's dead-end guarantee a runtime argument instead of a property of the
 * query.
 *
 * Deterministic and model-free throughout, which is also what makes §8 the
 * cheap alternative to `/suggest` — that surface runs the AI SDK tool loop and
 * costs a paid call per question.
 *
 * ## No full-text index, and why that is not an oversight
 *
 * The mirror holds 3,315 brands and 1,764 breweries. An infix `ILIKE` across
 * the four searchable columns cannot use a B-tree, so it is a sequential
 * scan — measured at **27 ms** against the live mirror, well inside the budget
 * for a server-rendered page and cheaper than carrying the `pg_trgm`
 * extension plus a GIN index. If the catalogue grows an order of magnitude, or
 * if §8 gains as-you-type results (it has none: the page is a GET form),
 * re-measure and add the index then.
 *
 * ## What §8 asks for that the data cannot answer yet
 *
 * - **A thumb per row.** Sakenowa's Data API publishes no images, the same
 *   reason §6's rows have none. #308 §7 asks the designers whether it survives.
 * - **A "Tasted" tag, and "Recently tasted" as the empty state.** Both need
 *   the journal, which per ADR-0020 persists for maintainers only. An
 *   anonymous visitor — most of them, by design — has nothing to show, so the
 *   empty state says what the field is for rather than promising a list that
 *   would always be blank.
 * - **The dashed "Add {query} yourself" row.** Manual entry is §5's
 *   "Added by you", which is Phase 2. #162 forbids advertising a surface that
 *   does not exist, so the row is absent rather than inert.
 */

/**
 * How many rows §8 returns.
 *
 * §8 gives no number. Twenty is where a phone-height list stops being
 * scannable, and a visitor whose query was specific finds it in the first
 * few — the ranking puts exact and prefix matches there. Someone who typed 山
 * and got 20 of 300 is better served by typing more than by scrolling.
 */
export const MAX_CATALOGUE_SEARCH_RESULTS = 20

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

/**
 * Label words that narrow a bottle but are not part of the sake's NAME.
 *
 * Sakenowa's unit is the brand — the line, like 獺祭 — and a label carries far
 * more than that: a polishing ratio (`45`, `23`), a grade (純米大吟醸), a
 * process (無濾過生原酒), a rice (山田錦), a volume (720ml). A visitor holding
 * the bottle types what they can read, which is all of it, and the catalogue
 * has none of it. "Dassai 23" is the reported case and it is the common one,
 * not an edge: it is what the shop shelf and the label both say.
 *
 * Longest first, so 純米大吟醸 is removed whole rather than leaving 大 behind
 * once 純米 goes. Romaji forms are matched on word boundaries; Japanese forms
 * are not, because Japanese does not space its words.
 */
const LABEL_QUALIFIERS_JA = [
  '特別純米吟醸',
  '無濾過生原酒',
  '純米大吟醸',
  '特別本醸造',
  '純米吟醸',
  '特別純米',
  'しぼりたて',
  'ひやおろし',
  '大吟醸',
  '本醸造',
  '生原酒',
  '五百万石',
  '山田錦',
  '無濾過',
  '荒走り',
  '中取り',
  'あらばしり',
  'にごり',
  '純米',
  '吟醸',
  '生酒',
  '原酒',
  '雄町',
  '生詰',
  '生貯',
  '新酒',
  '古酒',
  '辛口',
  '甘口',
] as const

const LABEL_QUALIFIERS_ROMAJI = [
  'junmai daiginjo',
  'tokubetsu junmai',
  'junmai ginjo',
  'honjozo',
  'daiginjo',
  'muroka',
  'nakadori',
  'arabashiri',
  'shiboritate',
  'hiyaoroshi',
  'yamadanishiki',
  'junmai',
  'ginjo',
  'genshu',
  'nigori',
  'nama',
  'omachi',
  'karakuchi',
  'amakuchi',
] as const

/**
 * Strip the label noise from a query, or return `null` if there was none to
 * strip (or if stripping would leave nothing to search for).
 *
 * **Used only as a fallback, never to narrow a query that worked.** A search
 * that found rows is answered; this runs when the visitor's query matched
 * nothing, so the alternative to a narrowed retry is a dead end. The page says
 * which query it ended up running, so the substitution is never silent.
 *
 * Numbers go too. On a label a bare number is a polishing ratio or a volume,
 * and neither identifies a line — 25 of 3,315 brand names contain a digit, and
 * those are names like `NEXT5`, which survive because stripping a digit that
 * is glued to a letter is not done here: only free-standing numbers go.
 */
export function stripLabelQualifiers(query: string): string | null {
  let out = query.trim()
  if (out.length === 0) return null

  for (const word of LABEL_QUALIFIERS_JA) {
    out = out.split(word).join(' ')
  }
  for (const word of LABEL_QUALIFIERS_ROMAJI) {
    out = out.replace(new RegExp(`\\b${word.replace(/ /g, '\\s+')}\\b`, 'gi'), ' ')
  }
  // Free-standing numbers only: `23`, `７２０`, `720ml`. `NEXT5` keeps its 5,
  // because the digit is part of the word.
  out = out.replace(/(?<![\p{L}\p{N}])[\d０-９]+\s*(?:ml|ML|㎖|ミリ|合|%|％|度)?(?![\p{L}\p{N}])/gu, ' ')
  out = out.replace(/\s+/g, ' ').trim()

  if (out.length === 0) return null
  if (out === query.trim()) return null
  return out
}

export interface CatalogueSearchResult {
  readonly brandId: number
  readonly nameKanji: string
  readonly nameRomaji: string | null
  readonly breweryKanji: string | null
  readonly breweryRomaji: string | null
}

interface CatalogueSearchRow {
  brand_id: number
  name_kanji: string
  name_romaji: string | null
  brewery_kanji: string | null
  brewery_romaji: string | null
}

/**
 * How many rows the query fetches before {@link rankCatalogueMatches} orders
 * them and the caller's limit slices.
 *
 * **The window exists because `LIMIT` runs before any JS can rank.** Ordering
 * the SQL by `char_length(name_kanji)` — inherited from the picker above — and
 * taking 20 chooses the twenty shortest-named matches, which has nothing to do
 * with whether they are what the visitor typed. Measured against the live
 * mirror, that dropped almost every good row: `山` matched 275 brands of which
 * 37 begin with 山, and **none of those 37 were in the twenty** the ranking
 * ever saw. `yama` kept 2 of 47. The ranker cannot promote a row the query
 * never returned.
 *
 * 200 is comfortably above the number of exact-or-prefix matches any real
 * query produces (the worst measured is 47), and five narrow columns at that
 * count is a negligible transfer on a scan that already costs ~27 ms.
 */
const CATALOGUE_CANDIDATE_WINDOW = 200

// The brewery join is LEFT, matching §6's: ~48 brands point at placeholder
// brewery rows, and a sake with an unknown brewery is still findable by its
// own name. `superseded_at IS NULL` on both per ADR-0014.
//
// `brands.name` is deliberately not searched. On every Sakenowa-sourced row it
// is byte-equal to `name_kanji` (verified against the mirror), so including it
// would widen the scan for no extra match. The picker above does search it,
// from before that was known; harmless there, not worth copying.
//
// `ORDER BY` carries a coarse copy of the tiers {@link catalogueTier} applies
// in JS. The duplication is deliberate and the two do NOT have to agree
// exactly: SQL's job is only to make sure the window cannot exclude a row JS
// would rank highly, and JS remains the single definition of the final order —
// the one with unit tests, because a `CASE` is unreachable without a database.
// Ties still fall back to the picker's shortest-name-first, so one query
// always produces one list.
const SEARCH_CATALOGUE = `
  SELECT
    b.brand_id,
    b.name_kanji,
    b.name_romaji,
    br.name_kanji  AS brewery_kanji,
    br.name_romaji AS brewery_romaji
  FROM brands b
  LEFT JOIN breweries br
    ON br.brewery_id = b.brewery_id
   AND br.superseded_at IS NULL
  WHERE b.superseded_at IS NULL
    AND (
         b.name_kanji   ILIKE $1
      OR b.name_romaji  ILIKE $1
      OR br.name_kanji  ILIKE $1
      OR br.name_romaji ILIKE $1
    )
  ORDER BY
    CASE
      WHEN lower(b.name_kanji) = $2 OR lower(b.name_romaji) = $2 THEN 0
      WHEN lower(b.name_kanji) LIKE $3 OR lower(b.name_romaji) LIKE $3 THEN 1
      WHEN b.name_kanji ILIKE $1 OR b.name_romaji ILIKE $1 THEN 2
      ELSE 3
    END ASC,
    char_length(b.name_kanji) ASC,
    b.name_kanji ASC,
    b.brand_id ASC
  LIMIT $4
`

/**
 * The outcome of a §8 search.
 *
 * Tagged, rather than "an empty array means nothing matched", because those
 * are different facts and the page says different things about them. Telling a
 * visitor "nothing in the catalogue matches" while the catalogue is
 * unreachable is a lie, and the one they would act on by retyping.
 */
export type CatalogueSearchOutcome =
  | {
      readonly kind: 'ok'
      readonly matches: readonly CatalogueSearchResult[]
      /**
       * Set when the visitor's own query matched nothing and a narrowed one
       * did. The page must say so — a substitution the visitor cannot see is
       * worse than the dead end it replaced.
       */
      readonly searchedInstead?: string
    }
  | { readonly kind: 'unavailable' }

/**
 * §8's matches, best first. `ok` with an empty list for a query too short to
 * be specific — see {@link isCatalogueQuerySpecific}.
 *
 * Throws on a database failure. The caller decides what that means;
 * {@link searchCatalogue} turns it into `unavailable`.
 */
export async function searchCatalogueFromPool(
  query: string,
  pool: Pool,
  limit: number = MAX_CATALOGUE_SEARCH_RESULTS,
): Promise<CatalogueSearchResult[]> {
  if (!isCatalogueQuerySpecific(query)) return []

  const trimmed = query.trim()
  const escaped = escapeLikePattern(trimmed)
  const capped = Math.min(Math.max(1, Math.trunc(limit)), MAX_CATALOGUE_SEARCH_RESULTS)
  const { rows } = await publicQuery<CatalogueSearchRow>(
    'brands',
    SEARCH_CATALOGUE,
    [`%${escaped}%`, trimmed.toLowerCase(), `${escaped.toLowerCase()}%`, CATALOGUE_CANDIDATE_WINDOW],
    pool,
  )

  // Fetch a window, rank it, then cut. Ranking after the cut would only
  // reorder rows the database had already chosen for an unrelated reason —
  // see `CATALOGUE_CANDIDATE_WINDOW`.
  return rankCatalogueMatches(query, rows.map(toCatalogueResult)).slice(0, capped)
}

/**
 * Server-component entry point. Tests pass their own pool to
 * {@link searchCatalogueFromPool} instead.
 *
 * **Never throws**, which is the difference between this surface and the
 * `/sake/*` detail routes. Those are nothing without their row, so they 500 or
 * 404 and every spec that touches them is DB-bound. §8 still has a field, an
 * empty state and a bridge to the camera when the mirror is unreachable — so a
 * database failure degrades to `unavailable` and the page says so.
 *
 * `getServerDbPool()` THROWS when `DATABASE_URL` is unset, which is CI's
 * Playwright webServer, so this catch is load-bearing in the same way
 * `getLandingSampleScan`'s is: without it every spec that loads `/search` with
 * a query fails and the suite slows to a crawl retrying. That is exactly the
 * regression this guard prevents — and it is how CI caught the missing guard
 * in the first place.
 */
export async function searchCatalogue(
  query: string,
  limit?: number,
): Promise<CatalogueSearchOutcome> {
  try {
    const pool = getServerDbPool()
    const matches = await searchCatalogueFromPool(query, pool, limit)
    if (matches.length > 0) return { kind: 'ok', matches }

    // Nothing matched. Before calling it a dead end, try the query without
    // the parts of a label that are not a sake's name — see
    // `stripLabelQualifiers`. "Dassai 23" is the reported case: the bottle
    // exists, the line is in the catalogue, and only the polishing ratio
    // stood between them.
    const narrowed = stripLabelQualifiers(query)
    if (narrowed === null || !isCatalogueQuerySpecific(narrowed)) {
      return { kind: 'ok', matches }
    }
    const fallback = await searchCatalogueFromPool(narrowed, pool, limit)
    if (fallback.length === 0) return { kind: 'ok', matches }
    return { kind: 'ok', matches: fallback, searchedInstead: narrowed }
  } catch {
    return { kind: 'unavailable' }
  }
}

/**
 * Order matches so the row the visitor meant is at the top.
 *
 * SQL filters and JS ranks, the same split §6 uses and for the same reason:
 * the comparison is a product decision that wants unit tests, and a SQL `CASE`
 * would put it where no test can reach without a database.
 *
 * Tiers: the name IS the query, then starts with it, then contains it, then
 * only the brewery matched — someone searching a maker rather than a sake
 * still gets their sakes, below the ones whose own name matched.
 *
 * Within a tier the SQL order survives, because `Array.prototype.sort` is
 * stable, so one query always produces one list.
 */
export function rankCatalogueMatches(
  query: string,
  matches: readonly CatalogueSearchResult[],
): CatalogueSearchResult[] {
  const needle = query.trim().toLowerCase()
  return [...matches].sort((a, b) => catalogueTier(a, needle) - catalogueTier(b, needle))
}

function catalogueTier(result: CatalogueSearchResult, needle: string): number {
  const names = [result.nameKanji, result.nameRomaji ?? ''].map((value) => value.toLowerCase())
  if (names.some((value) => value === needle)) return 0
  if (names.some((value) => value.startsWith(needle))) return 1
  if (names.some((value) => value.includes(needle))) return 2
  return 3
}

function toCatalogueResult(row: CatalogueSearchRow): CatalogueSearchResult {
  return {
    brandId: row.brand_id,
    nameKanji: row.name_kanji,
    nameRomaji: row.name_romaji,
    breweryKanji: row.brewery_kanji,
    breweryRomaji: row.brewery_romaji,
  }
}
