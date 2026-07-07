import 'server-only'
import { cache } from 'react'
import {
  lookupBrand,
  lookupBreweryByBrand,
  lookupFlavorChart,
} from '@/lib/sakenowa/lookup'
import type { FlavorChart } from '@/lib/schemas/flavor-chart'

/**
 * UX-E (#166): the landing hero leads with a real example scan result
 * instead of text. The example is a fixed, maintainer-chosen sake that is
 * actually in the Sakenowa catalogue, so its flavor chart and reverse
 * cross-beverage hook are real data — not a mock. This is the "show, don't
 * tell" money-shot that makes the product legible in ~5 seconds.
 *
 * The example is 木戸泉 (Kidoizumi) by 木戸泉酒造 in Chiba — a rich,
 * mellow, full-bodied house style whose reverse hook lands on Ruby Port /
 * Porter. The bottle was photographed by the maintainer (rights held);
 * unlike a visitor's label scan this is FIXED marketing content, so the
 * process-and-discard rule for scan images does not apply — the asset is
 * committed under `public/hero/`.
 */
export const SAMPLE_SCAN_BRAND_ID = 310

/**
 * Maintainer-supplied, rights-cleared bottle photo, cropped to the label
 * and stripped of EXIF/GPS before commit. Served from `public/`.
 */
export const SAMPLE_SCAN_PHOTO_SRC = '/hero/kidoizumi.jpg'

export interface LandingSampleScan {
  readonly brandId: number
  readonly sakeKanji: string
  readonly sakeRomaji: string | null
  readonly breweryKanji: string
  readonly breweryRomaji: string | null
  readonly flavorChart: FlavorChart | null
}

/**
 * Fetch the curated sample sake for the landing hero. Returns `null` when
 * the brand isn't in the mirror (e.g. a fresh DB before ingest, or a data
 * shift that drops the row) so the landing degrades gracefully to its
 * text sections rather than erroring. `cache()` dedupes across the same
 * request.
 */
export const getLandingSampleScan = cache(
  async (): Promise<LandingSampleScan | null> => {
    const [brand, brewery, flavorChart] = await Promise.all([
      lookupBrand(SAMPLE_SCAN_BRAND_ID),
      lookupBreweryByBrand(SAMPLE_SCAN_BRAND_ID),
      lookupFlavorChart(SAMPLE_SCAN_BRAND_ID),
    ])
    if (!brand) return null

    return {
      brandId: brand.brandId,
      sakeKanji: brand.nameKanji,
      sakeRomaji: brand.nameRomaji,
      breweryKanji: brewery?.nameKanji ?? '',
      breweryRomaji: brewery?.nameRomaji ?? null,
      flavorChart,
    }
  },
)
