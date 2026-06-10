/**
 * Static lookup for Sakenowa area / prefecture display.
 *
 * Sakenowa's `/areas` endpoint returns Japanese names only — no
 * English equivalents in the public API. The English names below are
 * the standard Hepburn-romanised forms used in everything from the
 * Statistics Bureau (Population Census) to airline destination
 * boards. They're editorial, not Sakenowa-sourced, so they don't go
 * through the Sakenowa-mirror ingest path.
 *
 * Mapping verified 2026-06-10 by fetching `/areas` directly:
 * areaIds 1–47 align exactly with JIS X 0401 prefecture codes, with
 * areaId 0 reserved for the "その他" (Other) sentinel used for
 * non-Japanese producers (CONTEXT.md "Flagged ambiguities" §
 * "areaId: 0 sentinel").
 *
 * Provenance for the English values: `manual_curation` per
 * ADR-0005's taxonomy. Editorial mapping by the maintainer, not
 * machine-derived or Sakenowa-sourced.
 */

export interface PrefectureNames {
  /** Sakenowa areaId. 0 is the "Other" sentinel. */
  id: number
  /** Sakenowa's kanji name (verified against /areas 2026-06-10). */
  nameJa: string
  /**
   * Standard Hepburn-romanised English name. The "県/府/都/道" suffix
   * is stripped per the convention used in English-language
   * geography references (Tokyo, not Tokyo-to). Areaid 0 uses
   * "International" rather than the literal "Other" because the
   * sentinel represents non-Japanese producers — "International" is
   * meaningful in a Japanese-context sake catalogue, "Other" is not.
   */
  nameEn: string
}

const PREFECTURES: ReadonlyArray<PrefectureNames> = [
  { id: 1, nameJa: '北海道', nameEn: 'Hokkaido' },
  { id: 2, nameJa: '青森県', nameEn: 'Aomori' },
  { id: 3, nameJa: '岩手県', nameEn: 'Iwate' },
  { id: 4, nameJa: '宮城県', nameEn: 'Miyagi' },
  { id: 5, nameJa: '秋田県', nameEn: 'Akita' },
  { id: 6, nameJa: '山形県', nameEn: 'Yamagata' },
  { id: 7, nameJa: '福島県', nameEn: 'Fukushima' },
  { id: 8, nameJa: '茨城県', nameEn: 'Ibaraki' },
  { id: 9, nameJa: '栃木県', nameEn: 'Tochigi' },
  { id: 10, nameJa: '群馬県', nameEn: 'Gunma' },
  { id: 11, nameJa: '埼玉県', nameEn: 'Saitama' },
  { id: 12, nameJa: '千葉県', nameEn: 'Chiba' },
  { id: 13, nameJa: '東京都', nameEn: 'Tokyo' },
  { id: 14, nameJa: '神奈川県', nameEn: 'Kanagawa' },
  { id: 15, nameJa: '新潟県', nameEn: 'Niigata' },
  { id: 16, nameJa: '富山県', nameEn: 'Toyama' },
  { id: 17, nameJa: '石川県', nameEn: 'Ishikawa' },
  { id: 18, nameJa: '福井県', nameEn: 'Fukui' },
  { id: 19, nameJa: '山梨県', nameEn: 'Yamanashi' },
  { id: 20, nameJa: '長野県', nameEn: 'Nagano' },
  { id: 21, nameJa: '岐阜県', nameEn: 'Gifu' },
  { id: 22, nameJa: '静岡県', nameEn: 'Shizuoka' },
  { id: 23, nameJa: '愛知県', nameEn: 'Aichi' },
  { id: 24, nameJa: '三重県', nameEn: 'Mie' },
  { id: 25, nameJa: '滋賀県', nameEn: 'Shiga' },
  { id: 26, nameJa: '京都府', nameEn: 'Kyoto' },
  { id: 27, nameJa: '大阪府', nameEn: 'Osaka' },
  { id: 28, nameJa: '兵庫県', nameEn: 'Hyogo' },
  { id: 29, nameJa: '奈良県', nameEn: 'Nara' },
  { id: 30, nameJa: '和歌山県', nameEn: 'Wakayama' },
  { id: 31, nameJa: '鳥取県', nameEn: 'Tottori' },
  { id: 32, nameJa: '島根県', nameEn: 'Shimane' },
  { id: 33, nameJa: '岡山県', nameEn: 'Okayama' },
  { id: 34, nameJa: '広島県', nameEn: 'Hiroshima' },
  { id: 35, nameJa: '山口県', nameEn: 'Yamaguchi' },
  { id: 36, nameJa: '徳島県', nameEn: 'Tokushima' },
  { id: 37, nameJa: '香川県', nameEn: 'Kagawa' },
  { id: 38, nameJa: '愛媛県', nameEn: 'Ehime' },
  { id: 39, nameJa: '高知県', nameEn: 'Kochi' },
  { id: 40, nameJa: '福岡県', nameEn: 'Fukuoka' },
  { id: 41, nameJa: '佐賀県', nameEn: 'Saga' },
  { id: 42, nameJa: '長崎県', nameEn: 'Nagasaki' },
  { id: 43, nameJa: '熊本県', nameEn: 'Kumamoto' },
  { id: 44, nameJa: '大分県', nameEn: 'Oita' },
  { id: 45, nameJa: '宮崎県', nameEn: 'Miyazaki' },
  { id: 46, nameJa: '鹿児島県', nameEn: 'Kagoshima' },
  { id: 47, nameJa: '沖縄県', nameEn: 'Okinawa' },
  // areaId 0 — Sakenowa's "その他" sentinel for non-Japanese
  // producers. Rendered as "International" rather than the literal
  // "Other" because it's more meaningful in a sake catalogue.
  { id: 0, nameJa: 'その他', nameEn: 'International' },
] as const

const BY_ID = new Map(PREFECTURES.map((p) => [p.id, p]))

/**
 * Look up the static prefecture names for a Sakenowa areaId. Returns
 * `null` for unknown ids — Sakenowa has been stable on this list for
 * years, but a null return is safer than a synthesised guess if they
 * ever extend the set.
 */
export function getPrefectureNames(areaId: number): PrefectureNames | null {
  return BY_ID.get(areaId) ?? null
}

/** Total number of mapped entries. Useful for tests. */
export const PREFECTURE_COUNT = PREFECTURES.length
