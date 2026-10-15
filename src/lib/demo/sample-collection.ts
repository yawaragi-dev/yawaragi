import type { FlavorProfile } from '@/lib/schemas/flavor-profile'
import type { CellarBottle } from '@/lib/schemas/cellar-bottle'
import type { Expression } from '@/lib/schemas/expression'
import type { JournalEntry, QuickTag } from '@/lib/schemas/journal-entry'

/**
 * The sample collection a visitor without an account can look through: a
 * journal, a cellar and one bottling of their own, as the private beta keeps
 * them (ADR-0020), so the screens behind the account can be seen at all.
 *
 * Real catalogue sakes with their real Sakenowa flavor charts (as mirrored on
 * 2026-10-15), so every row links to a page that exists and the Palate is
 * derived exactly as a real one is. The ratings are made up and tell one
 * story: floral and light sakes rated high, rich and dry ones low.
 *
 * Dated relative to `now`, so "3 days ago" reads the same whenever it is
 * opened. The notes are the visitor's own words in a real journal; here they
 * are ours, so they come from `messages/*.json` through `notes`.
 */

const DAY = 24 * 60 * 60 * 1000

const fp = (f1: number, f2: number, f3: number, f4: number, f5: number, f6: number): FlavorProfile => ({
  f1,
  f2,
  f3,
  f4,
  f5,
  f6,
})

interface SampleSake {
  brandId: number
  nameKanji: string
  nameRomaji: string
  chart: FlavorProfile
}

const HANAABI: SampleSake = { brandId: 1179, nameKanji: '花陽浴', nameRomaji: 'Hanaabi', chart: fp(0.66, 0.58, 0.13, 0.16, 0.12, 0.41) }
const KAZE_NO_MORI: SampleSake = { brandId: 792, nameKanji: '風の森', nameRomaji: 'Kaze no Mori', chart: fp(0.48, 0.48, 0.23, 0.26, 0.2, 0.61) }
const ARAMASA: SampleSake = { brandId: 109, nameKanji: '新政', nameRomaji: 'Aramasa', chart: fp(0.5, 0.5, 0.27, 0.29, 0.16, 0.57) }
const JIKON: SampleSake = { brandId: 660, nameKanji: '而今', nameRomaji: 'Jikon', chart: fp(0.45, 0.58, 0.25, 0.38, 0.22, 0.45) }
const ZAKU: SampleSake = { brandId: 1033, nameKanji: '作', nameRomaji: 'Zaku', chart: fp(0.52, 0.55, 0.21, 0.34, 0.23, 0.46) }
const NABESHIMA: SampleSake = { brandId: 975, nameKanji: '鍋島', nameRomaji: 'Nabeshima', chart: fp(0.48, 0.53, 0.22, 0.32, 0.25, 0.52) }
const DASSAI: SampleSake = { brandId: 887, nameKanji: '獺祭', nameRomaji: 'Dassai', chart: fp(0.5, 0.52, 0.25, 0.4, 0.21, 0.46) }
const KOKURYU: SampleSake = { brandId: 522, nameKanji: '黒龍', nameRomaji: 'Kokuryu', chart: fp(0.4, 0.53, 0.26, 0.39, 0.36, 0.47) }
const SUIGEI: SampleSake = { brandId: 933, nameKanji: '酔鯨', nameRomaji: 'Suigei', chart: fp(0.3, 0.43, 0.25, 0.35, 0.53, 0.51) }
const SHIRAKAWAGO: SampleSake = { brandId: 583, nameKanji: '白川郷', nameRomaji: 'Shirakawago', chart: fp(0.17, 0.54, 0.58, 0.47, 0.17, 0.32) }
const JUYONDAI: SampleSake = { brandId: 144, nameKanji: '十四代', nameRomaji: 'Juyondai', chart: fp(0.5, 0.61, 0.24, 0.35, 0.18, 0.42) }

/** The one bottling the sample visitor added themselves, under 而今. */
export const SAMPLE_BOTTLING_ID = 'sample-jikon-omachi'
const JIKON_OMACHI = { id: SAMPLE_BOTTLING_ID, name: 'Jikon Junmai Ginjo Omachi' }

/** Keys of the notes in `messages/*.json` → `sampleCollection.notes`. */
export type SampleNoteKey = 'hanaabi' | 'jikonOmachi' | 'shirakawago' | 'aramasa'

interface Tasting {
  sake: SampleSake
  daysAgo: number
  rating: 1 | 2 | 3 | 4 | 5
  note?: SampleNoteKey
  tags?: QuickTag[]
  bottling?: typeof JIKON_OMACHI
  detail?: JournalEntry['detail']
}

// Newest first, as every surface lists a journal.
const TASTINGS: readonly Tasting[] = [
  { sake: HANAABI, daysAgo: 3, rating: 5, note: 'hanaabi', tags: ['axis:f1', 'chilled'] },
  {
    sake: JIKON,
    daysAgo: 9,
    rating: 5,
    note: 'jikonOmachi',
    bottling: JIKON_OMACHI,
    tags: ['axis:f2'],
    detail: { palate: { sweetness: 3, acidity: 4, umami: 3, finish: 4 }, serve: { temperature: 'hanabie' } },
  },
  { sake: SUIGEI, daysAgo: 16, rating: 3, tags: ['withFood'] },
  { sake: KAZE_NO_MORI, daysAgo: 24, rating: 5, tags: ['axis:f6', 'chilled'] },
  { sake: SHIRAKAWAGO, daysAgo: 33, rating: 2, note: 'shirakawago', tags: ['axis:f3'] },
  { sake: ZAKU, daysAgo: 41, rating: 4 },
  { sake: KOKURYU, daysAgo: 52, rating: 3, tags: ['warm'] },
  { sake: ARAMASA, daysAgo: 60, rating: 5, note: 'aramasa', tags: ['axis:f6'] },
  { sake: DASSAI, daysAgo: 74, rating: 4, tags: ['withFood'] },
  { sake: NABESHIMA, daysAgo: 88, rating: 4, tags: ['axis:f1'] },
]

const sakeName = (s: SampleSake) => ({ nameKanji: s.nameKanji, nameRomaji: s.nameRomaji })

export interface SampleCollection {
  entries: readonly JournalEntry[]
  cellar: readonly CellarBottle[]
  expressions: readonly Expression[]
}

export function buildSampleCollection({
  now,
  notes,
}: {
  now: number
  notes: (key: SampleNoteKey) => string
}): SampleCollection {
  const entries: JournalEntry[] = TASTINGS.map((t, i) => {
    const at = now - t.daysAgo * DAY
    return {
      schemaVersion: 3,
      id: `sample-${i + 1}`,
      event: { kind: 'rating', rating: t.rating, brandId: t.sake.brandId, target: t.sake.chart, occurredAt: at },
      sake: sakeName(t.sake),
      ...(t.bottling ? { expression: t.bottling } : {}),
      ...(t.note ? { notes: notes(t.note) } : {}),
      ...(t.tags ? { tags: t.tags } : {}),
      ...(t.detail ? { detail: t.detail } : {}),
      triedAt: at,
      createdAt: at,
    }
  })

  // Every state §11 draws: a bottle open a few days, one open long enough to
  // be best finished soon, sealed bottles in two sizes, and a bottle of the
  // visitor's own bottling.
  const bottle = (
    sake: SampleSake,
    rest: Pick<CellarBottle, 'sizeMl' | 'nama' | 'count'> & {
      openedDaysAgo?: number
      addedDaysAgo: number
      expression?: typeof JIKON_OMACHI
    },
  ): CellarBottle => ({
    schemaVersion: 3,
    brandId: sake.brandId,
    ...(rest.expression ? { expression: rest.expression } : {}),
    sake: sakeName(sake),
    sizeMl: rest.sizeMl,
    nama: rest.nama,
    count: rest.count,
    openedAt: rest.openedDaysAgo == null ? null : now - rest.openedDaysAgo * DAY,
    addedAt: now - rest.addedDaysAgo * DAY,
    updatedAt: now - (rest.openedDaysAgo ?? rest.addedDaysAgo) * DAY,
  })
  const cellar: CellarBottle[] = [
    bottle(HANAABI, { sizeMl: 720, nama: true, count: 1, openedDaysAgo: 3, addedDaysAgo: 10 }),
    bottle(NABESHIMA, { sizeMl: 720, nama: false, count: 1, openedDaysAgo: 12, addedDaysAgo: 30 }),
    bottle(JUYONDAI, { sizeMl: 1800, nama: false, count: 1, addedDaysAgo: 21 }),
    bottle(KAZE_NO_MORI, { sizeMl: 720, nama: true, count: 2, addedDaysAgo: 6 }),
    bottle(JIKON, { sizeMl: 720, nama: false, count: 1, addedDaysAgo: 9, expression: JIKON_OMACHI }),
  ]

  const expressions: Expression[] = [
    {
      schemaVersion: 1,
      id: SAMPLE_BOTTLING_ID,
      own: true,
      brandId: JIKON.brandId,
      line: sakeName(JIKON),
      name: JIKON_OMACHI.name,
      grade: 'junmai_ginjo',
      polishingPct: 50,
      createdAt: now - 9 * DAY,
      updatedAt: now - 9 * DAY,
    },
  ]

  return { entries, cellar, expressions }
}
