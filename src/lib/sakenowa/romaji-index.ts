import 'server-only'
import type { Pool } from 'pg'
import { publicQuery } from '@/lib/supabase/public-query'
import { looseRomajiKey, romajiKey } from './romaji-key'

/**
 * The catalogue's Latin names, keyed by {@link romajiKey}.
 *
 * Comparing a Latin name with the catalogue in SQL means writing the key's
 * rules a second time as nested `regexp_replace`, and keeping the two in
 * step. The mirror is small — about 4,000 sakes and 1,800 breweries — so the
 * names are read once, keyed in the one place the rules live, and held for a
 * few minutes. The catalogue only changes when the scheduled ingest runs.
 */

export interface RomajiIndexEntry {
  readonly brandId: number
  readonly breweryId: number
  /** Keys of the sake's own Latin names (`name`, `name_romaji`). */
  readonly brandKeys: readonly string[]
  /** Key of the brewery's romaji, or `null` where it has none. */
  readonly breweryKey: string | null
  readonly looseBrandKeys: readonly string[]
  /**
   * Other names the sake is sold under (`name_aliases`, #413), each with its
   * key. Apart from `brandKeys` on purpose: a hit on an alias ranks below a
   * hit on the name, and the row says which name matched.
   */
  readonly aliases: readonly { readonly key: string; readonly alias: string }[]
}

export interface RomajiIndex {
  readonly entries: readonly RomajiIndexEntry[]
  /**
   * Sakes whose own Latin name is one of `keys`. `withAliases` adds the sakes
   * one of whose other names is (the scan's Latin lookup, where a match by
   * either needs a second witness anyway).
   */
  brandIdsNamed(keys: readonly string[], options?: { loose?: boolean; withAliases?: boolean }): number[]
  /** Breweries whose romaji, or one of whose other names, is one of `keys`. */
  breweryIdsNamed(keys: readonly string[]): number[]
}

export interface AliasRow {
  kind: 'brand' | 'brewery'
  id: number
  alias: string
}

interface IndexRow {
  brand_id: number
  brewery_id: number
  name: string | null
  name_romaji: string | null
  brewery_romaji: string | null
}

const SELECT_LATIN_NAMES = `
  SELECT br.brand_id, br.brewery_id, br.name, br.name_romaji, b.name_romaji AS brewery_romaji
  FROM brands br
  JOIN breweries b ON b.brewery_id = br.brewery_id
  WHERE br.superseded_at IS NULL
    AND b.superseded_at IS NULL
`

// A database the 0019 migration has not reached yet reads as "no aliases",
// so search and scan keep working while it rolls out.
const SELECT_ALIASES = `SELECT kind, id, alias FROM name_aliases`

/** Latin letters only: a `name` that is kanji has no key worth holding. */
const keysOf = (...names: (string | null | undefined)[]) => [
  ...new Set(
    names
      .flatMap((name) => (typeof name === 'string' && /[A-Za-z]/.test(name) ? [romajiKey(name)] : []))
      .filter((k) => k.length > 0),
  ),
]

export function buildRomajiIndex(rows: readonly IndexRow[], aliasRows: readonly AliasRow[] = []): RomajiIndex {
  const aliasesOf = (kind: AliasRow['kind'], id: number) =>
    aliasRows
      .filter((a) => a.kind === kind && a.id === id)
      .map((a) => ({ key: romajiKey(a.alias), alias: a.alias }))
      .filter((a) => a.key.length > 0)
  const breweryAliasKeys = new Map<number, string[]>()
  for (const a of aliasRows) {
    if (a.kind !== 'brewery') continue
    const key = romajiKey(a.alias)
    if (key.length > 0) breweryAliasKeys.set(a.id, [...(breweryAliasKeys.get(a.id) ?? []), key])
  }
  const entries: RomajiIndexEntry[] = rows.map((row) => {
    const latinNames = [row.name, row.name_romaji].filter((n): n is string => typeof n === 'string' && /[A-Za-z]/.test(n))
    return {
      brandId: row.brand_id,
      breweryId: row.brewery_id,
      brandKeys: keysOf(row.name, row.name_romaji),
      breweryKey: row.brewery_romaji ? romajiKey(row.brewery_romaji) : null,
      looseBrandKeys: [...new Set(latinNames.map(looseRomajiKey))],
      aliases: aliasesOf('brand', row.brand_id),
    }
  })
  return {
    entries,
    brandIdsNamed(keys, options) {
      const wanted = new Set(keys)
      return entries
        .filter(
          (e) =>
            (options?.loose ? e.looseBrandKeys : e.brandKeys).some((k) => wanted.has(k)) ||
            (options?.withAliases === true && e.aliases.some((a) => wanted.has(a.key))),
        )
        .map((e) => e.brandId)
    },
    breweryIdsNamed(keys) {
      const wanted = new Set(keys)
      return [
        ...new Set(
          entries
            .filter(
              (e) =>
                (e.breweryKey !== null && wanted.has(e.breweryKey)) ||
                (breweryAliasKeys.get(e.breweryId) ?? []).some((k) => wanted.has(k)),
            )
            .map((e) => e.breweryId),
        ),
      ]
    },
  }
}

const TTL_MS = 5 * 60 * 1000
const cache = new WeakMap<Pool, { at: number; index: Promise<RomajiIndex> }>()

export async function getRomajiIndex(pool: Pool): Promise<RomajiIndex> {
  const held = cache.get(pool)
  if (held && Date.now() - held.at < TTL_MS) return held.index
  const index = Promise.all([
    publicQuery<IndexRow>('brands', SELECT_LATIN_NAMES, [], pool),
    publicQuery<AliasRow>('name_aliases', SELECT_ALIASES, [], pool).catch(() => ({ rows: [] as AliasRow[] })),
  ]).then(([names, aliases]) => buildRomajiIndex(names.rows, aliases.rows))
  cache.set(pool, { at: Date.now(), index })
  // A failed read must not be served for five minutes.
  index.catch(() => cache.delete(pool))
  return index
}

/** For tests that change the catalogue between lookups. */
export function forgetRomajiIndex(pool: Pool): void {
  cache.delete(pool)
}
