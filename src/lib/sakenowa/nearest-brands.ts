import 'server-only'
import type { Pool } from 'pg'
import { publicQuery } from '@/lib/supabase/public-query'
import { getServerDbPool } from '@/lib/supabase/server-client'
import { generateKanjiVariants } from '@/lib/sakenowa/kanji-variants'
import { stripLabelQualifiers } from '@/lib/sakenowa/search-brands'

/**
 * §5a "Did you mean" for a scan that found nothing: the catalogue sakes
 * nearest to what the label read, by name or by brewery.
 *
 * The lookup chain (`findSakeByExtractionFromPool`) only accepts exact
 * matches, modulo kana, 旧/新 kanji and operational suffixes. That is right
 * for a match — a wrong sake is worse than none — but it leaves a near miss
 * (one misread character, a grade word glued to the name) as a dead end.
 * Here the bar is lower because the screen says what these are: guesses,
 * each with its reason in words, never styled as a match.
 *
 * Deterministic and model-free. The measure is the Dice coefficient over
 * character bigrams with start and end markers, which suits Japanese (no
 * word breaks, short names) and romaji alike. The whole catalogue is
 * ~3,300 rows, so it is ranked in memory rather than with `pg_trgm`.
 */

/** Below this neither a name nor a brewery counts as near. */
const NEAR = 0.5

/**
 * A likeness also has to be within this share of the best one of its kind.
 * One short name inside a longer one scores 0.5 (千代 in 富久千代); that is
 * worth offering when it is the best there is, and noise beside an exact read.
 */
const RELATIVE = 0.75

/** §5a: "Up to 3." */
export const MAX_NEAREST_BRANDS = 3

export interface NearestBrandRow {
  readonly brandId: number
  readonly nameKanji: string
  readonly nameRomaji: string | null
  readonly breweryKanji: string | null
  readonly breweryRomaji: string | null
  readonly areaId: number | null
}

/** Why a candidate is offered — rendered as words, never as a percentage. */
export type NearestReason = 'name' | 'brewery' | 'both'

export interface NearestBrand {
  readonly row: NearestBrandRow
  readonly reason: NearestReason
  /** The brewery is the one that was read, not just a lookalike. */
  readonly sameBrewery: boolean
}

/** Company forms a label prints and the catalogue does not. */
const COMPANY_FORMS = /株式会社|有限会社|合資会社|合名会社|[（(]株[）)]|㈱/g

function normalise(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(COMPANY_FORMS, '').replace(/[\s・·.\-'’]/g, '')
}

function bigrams(text: string): Set<string> {
  const chars = ['^', ...Array.from(text), '$']
  const out = new Set<string>()
  for (let i = 0; i < chars.length - 1; i++) out.add(chars[i] + chars[i + 1])
  return out
}

function dice(a: Set<string>, b: Set<string>): number {
  let shared = 0
  for (const gram of a) if (b.has(gram)) shared++
  return (2 * shared) / (a.size + b.size)
}

function best(reads: readonly Set<string>[], targets: readonly (string | null)[]): number {
  let top = 0
  for (const target of targets) {
    if (!target) continue
    const grams = bigrams(target)
    for (const read of reads) top = Math.max(top, dice(read, grams))
  }
  return top
}

/** A name as compared: label words out, every 旧/新 kanji form in. */
function nameForms(name: string): Set<string>[] {
  const stripped = normalise(stripLabelQualifiers(name) ?? name)
  return stripped ? generateKanjiVariants(stripped).map(bigrams) : []
}

/**
 * Endings that say "brewery" rather than which one. Wider than the lookup's
 * operational suffixes (`brewery-variants.ts`), which must stay exact: here
 * `醸造店` or `商店` left in would only make strangers look alike.
 */
const BREWERY_ENDING = /(?:酒造場|酒造店|醸造場|醸造店|酒造|醸造|本店|商店|shuzo|brewery)$/

/** A brewery as compared, without its ending — every second brewery has one. */
function breweryStem(brewery: string): string {
  const normalised = normalise(brewery)
  return normalised.replace(BREWERY_ENDING, '') || normalised
}

function breweryForms(brewery: string): Set<string>[] {
  const stem = breweryStem(brewery)
  return stem ? generateKanjiVariants(stem).map(bigrams) : []
}

export function rankNearestBrands(
  read: { readonly name: string; readonly brewery: string },
  catalogue: readonly NearestBrandRow[],
  options: { readonly exclude?: number } = {},
): NearestBrand[] {
  const names = nameForms(read.name)
  const breweries = breweryForms(read.brewery)

  // The excluded sake (§5's match, when this lists the others) goes before
  // the relative bar is set: an exact match would otherwise raise it out of
  // reach of every alternative.
  const all = catalogue
    .filter((row) => row.brandId !== options.exclude)
    .map((row) => ({
      row,
      name: best(names, [normalise(row.nameKanji), row.nameRomaji && normalise(row.nameRomaji)]),
      brewery: best(breweries, [
        row.breweryKanji && breweryStem(row.breweryKanji),
        row.breweryRomaji && breweryStem(row.breweryRomaji),
      ]),
    }))
  const topName = Math.max(0, ...all.map((c) => c.name))
  const topBrewery = Math.max(0, ...all.map((c) => c.brewery))
  const scored = all
    .map((c) => ({
      ...c,
      nameNear: c.name >= NEAR && c.name >= RELATIVE * topName,
      breweryNear: c.brewery >= NEAR && c.brewery >= RELATIVE * topBrewery,
    }))
    .filter((c) => c.nameNear || c.breweryNear)

  // Ties go to the closer name, then the lower brandId, so one read always
  // produces one list.
  scored.sort(
    (a, b) => b.name + b.brewery - (a.name + a.brewery) || b.name - a.name || a.row.brandId - b.row.brandId,
  )

  return scored.slice(0, MAX_NEAREST_BRANDS).map(({ row, brewery, nameNear, breweryNear }) => ({
    row,
    reason: nameNear && breweryNear ? 'both' : nameNear ? 'name' : 'brewery',
    sameBrewery: brewery === 1,
  }))
}

interface NearestBrandQueryRow {
  brand_id: number
  name_kanji: string
  name_romaji: string | null
  brewery_kanji: string | null
  brewery_romaji: string | null
  area_id: number | null
}

// Every live brand, charted or not: a chartless sake is still the one on the
// label. LEFT JOIN as in §6 and §8, superseded rows out per ADR-0014.
const SELECT_CATALOGUE_NAMES = `
  SELECT b.brand_id, b.name_kanji, b.name_romaji,
         br.name_kanji AS brewery_kanji, br.name_romaji AS brewery_romaji, br.area_id
  FROM brands b
  LEFT JOIN breweries br ON br.brewery_id = b.brewery_id AND br.superseded_at IS NULL
  WHERE b.superseded_at IS NULL
  ORDER BY b.brand_id
`

export async function findNearestBrandsFromPool(
  read: { readonly name: string; readonly brewery: string },
  pool: Pool,
  options: { readonly exclude?: number } = {},
): Promise<NearestBrand[]> {
  const { rows } = await publicQuery<NearestBrandQueryRow>('brands', SELECT_CATALOGUE_NAMES, [], pool)
  return rankNearestBrands(
    read,
    rows.map((r) => ({
      brandId: r.brand_id,
      nameKanji: r.name_kanji,
      nameRomaji: r.name_romaji,
      breweryKanji: r.brewery_kanji,
      breweryRomaji: r.brewery_romaji,
      areaId: r.area_id,
    })),
    options,
  )
}

/**
 * Never throws: "Did you mean" is a help on a screen that already works
 * without it, so a database failure means no candidates, not a failed scan.
 */
export async function findNearestBrands(
  read: { readonly name: string; readonly brewery: string },
  options: { readonly exclude?: number } = {},
): Promise<NearestBrand[]> {
  try {
    return await findNearestBrandsFromPool(read, getServerDbPool(), options)
  } catch {
    return []
  }
}
