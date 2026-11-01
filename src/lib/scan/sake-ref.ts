import { getPathname } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { getPrefectureNames } from '@/lib/sakenowa/prefecture'
import { isPlaceholderBrewery } from '@/lib/schemas/brewery'
import { ARRIVED_VIA_SCAN_QUERY } from '@/lib/scan/arrived-via-scan'
import type { SakeRef } from './scan-action-state'

/** A catalogue name: the Latin reading the ingest gave it (#121), else Sakenowa's published one. */
interface Named {
  nameKanji: string
  nameRomaji?: string | null
  name?: string | null
}

/**
 * The one way the scan names a catalogue sake (`SakeRef`): the Latin name
 * over Sakenowa's own, the prefecture from the static editorial area map
 * (`manual_curation`, no query; a proper noun, the same in EN and DE), and
 * the link to its page. The brewery's names are null when the row has none,
 * and for Sakenowa's "maker not on record" placeholder (#419), which keeps
 * only its prefecture.
 */
export function sakeRefOf(
  sake: Named & { brandId: number },
  brewery: (Named & { areaId: number | null }) | null,
  locale: Locale,
): SakeRef {
  const named = brewery !== null && !isPlaceholderBrewery(brewery) ? brewery : null
  return {
    brandId: sake.brandId,
    sakeHref: sakeHrefFor(sake.brandId, locale),
    nameKanji: sake.nameKanji,
    nameRomaji: bestRomaji(sake),
    breweryKanji: named?.nameKanji ?? null,
    breweryRomaji: named ? bestRomaji(named) : null,
    prefectureName: brewery?.areaId == null ? null : (getPrefectureNames(brewery.areaId)?.nameEn ?? null),
  }
}

/**
 * Locale-aware `/sake/[brandId]` pathname. The `?from=scan` query is what
 * lets the bottle page offer "Not the bottle you scanned?" and show the
 * visitor's photo (see `arrived-via-scan.ts`).
 */
export function sakeHrefFor(brandId: number, locale: Locale): string {
  return getPathname({
    locale,
    href: {
      pathname: '/sake/[brandId]',
      params: { brandId: String(brandId) },
      query: ARRIVED_VIA_SCAN_QUERY,
    },
  })
}

/**
 * Best-available English label for a Sakenowa entity: the LLM-derived
 * `nameRomaji` (#121) over Sakenowa's published `name`. Null only when both
 * are empty (CONTEXT.md "Naming convention" allows an empty brewery name).
 */
export function bestRomaji(entity: { nameRomaji?: string | null; name?: string | null }): string | null {
  if (entity.nameRomaji) return entity.nameRomaji
  if (entity.name) return entity.name
  return null
}
