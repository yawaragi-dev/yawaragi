/**
 * Japan's eight traditional regions (地方), by Sakenowa areaId (= the JIS
 * X 0401 prefecture code, see `prefecture.ts`): the grouping school atlases
 * and the Statistics Bureau use. Mie sits in Kansai (Kinki), Okinawa in
 * Kyūshū, as in that division. Editorial, `manual_curation` per ADR-0005.
 *
 * Used by "What stands out" (design v1.10, AB2) to say where the visitor's
 * highest ratings come from at a scale a prefecture is too small for.
 */
export const JAPAN_REGIONS = ['hokkaido', 'tohoku', 'kanto', 'chubu', 'kansai', 'chugoku', 'shikoku', 'kyushu'] as const
export type JapanRegion = (typeof JAPAN_REGIONS)[number]

/** The last prefecture code of each region, in JIS order. */
const LAST_CODE: ReadonlyArray<readonly [number, JapanRegion]> = [
  [1, 'hokkaido'],
  [7, 'tohoku'],
  [14, 'kanto'],
  [23, 'chubu'],
  [30, 'kansai'],
  [35, 'chugoku'],
  [39, 'shikoku'],
  [47, 'kyushu'],
]

/** The region a prefecture is in; `null` for areaId 0 ("Other") or anything out of range. */
export function regionOfArea(areaId: number): JapanRegion | null {
  if (!Number.isInteger(areaId) || areaId < 1) return null
  return LAST_CODE.find(([last]) => areaId <= last)?.[1] ?? null
}
