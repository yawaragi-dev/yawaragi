import 'server-only'

import { unstable_cache } from 'next/cache'
import { getServerDbPool } from '@/lib/supabase/server-client'
import { isCatalogueQuerySpecific, searchCatalogueFromPool, type CatalogueSearchResult } from './search-brands'

/** How many rows the suggestion list under §8's field shows (#326). */
export const MAX_SUGGESTIONS = 6

/**
 * The same catalogue search as §8's results, cut to a handful, for the list
 * that opens under the field while the visitor types (#326).
 *
 * Cached per query for six hours, like the rest of the catalogue reads: the
 * mirror changes once a day at most, and every visitor typing "dassai" passes
 * through "da", "das", "dass" — the same few prefixes. The cache is keyed on
 * the trimmed, lower-cased query and holds public catalogue rows only.
 * A failure throws inside the cache (so it is not kept) and comes back as an
 * empty list: the field and Enter still work without suggestions.
 *
 * Only the visitor's own words are searched. The label-word fallback §8 runs
 * at rest ("Dassai 23" → "Dassai") is left out here, or the list would jump
 * between the typed and the narrowed query mid-word.
 */
export async function suggestCatalogue(query: string): Promise<CatalogueSearchResult[]> {
  if (!isCatalogueQuerySpecific(query)) return []
  try {
    return await cachedSuggestions(query.trim().toLowerCase())
  } catch {
    return []
  }
}

const cachedSuggestions = unstable_cache(
  async (key: string) => searchCatalogueFromPool(key, getServerDbPool(), MAX_SUGGESTIONS),
  ['catalogue-suggestions-v1'],
  { revalidate: 6 * 60 * 60 },
)
