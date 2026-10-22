import type { GuideSlug } from './entries'

/**
 * The Learn entry about a prefecture's sake, by Sakenowa areaId (= the JIS
 * prefecture code). Ten to start with (design question Y); a prefecture not
 * listed shows its name alone, as before.
 */
const REGION_BY_AREA: Readonly<Record<number, GuideSlug>> = {
  3: 'region-iwate',
  6: 'region-yamagata',
  15: 'region-niigata',
  20: 'region-nagano',
  22: 'region-shizuoka',
  24: 'region-mie',
  25: 'region-shiga',
  26: 'region-kyoto',
  28: 'region-hyogo',
  41: 'region-saga',
}

export function regionEntryFor(areaId: number): GuideSlug | null {
  return REGION_BY_AREA[areaId] ?? null
}
