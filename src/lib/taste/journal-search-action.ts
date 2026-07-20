'use server'

import { currentUserIsMaintainer } from '@/lib/auth/maintainer'
import { searchBrands } from '@/lib/sakenowa/search-brands'

/**
 * A candidate for the journal "Log a sake" picker — the minimal shape the form
 * needs to show a row and, on select, log by `brandId`.
 */
export interface JournalSearchCandidate {
  brandId: number
  nameKanji: string
  nameRomaji: string | null
}

/**
 * Maintainer-gated typeahead behind the journal log form (P5.5-C, ADR-0020).
 * Wraps the ungated `searchBrands` primitive (C2b) with the same maintainer gate
 * the write actions use — the journal is a private-beta surface, so a
 * non-maintainer gets an empty list rather than a working search endpoint. Only
 * charted brands come back (searchBrands' INNER JOIN), so every pick is loggable.
 */
export async function searchJournalSake(query: string): Promise<JournalSearchCandidate[]> {
  if (!(await currentUserIsMaintainer())) return []
  const brands = await searchBrands(query)
  return brands.map((b) => ({
    brandId: b.brandId,
    nameKanji: b.nameKanji,
    nameRomaji: b.nameRomaji,
  }))
}
