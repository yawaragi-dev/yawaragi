import { describe, expect, it, vi } from 'vitest'
import type { Brand } from '@/lib/schemas/brand'
import type { Brewery } from '@/lib/schemas/brewery'
import {
  resolveScannedLabel,
  type ScannedLabel,
  type ScannedLabelLookupExecutor,
} from './resolve-scanned-label'
import type {
  BrandOnlyLookupResult,
  BreweryOnlyLookupResult,
  FindSakeByExtractionResult,
} from './label-match'

// resolveScannedLabel owns the WHOLE label-matching job — every
// pre-lookup guard (confidence-tier gate, placeholder sentinel,
// Latin-brewery shaping, single-character hallucination rescue) AND the
// composition that drives the Sakenowa pass cascade. Before #198 these
// guards + the single-char brewery-only → field-swap composition lived
// in scan-action.ts and were only reachable through a vision mock and
// the rate-limit gate. Here we inject a fake executor and drive the
// guard × cascade interactions directly — no vision model, no
// rate-limit, no Postgres. The passes themselves are covered against
// real Postgres in `catalogue.integration.test.ts`.

// --- Fixtures ---------------------------------------------------------

const TAKASHIMIZU_BRAND: Brand = {
  brandId: 200,
  name: 'Takashimizu',
  nameKanji: '高清水',
  nameRomaji: 'Takashimizu',
  breweryId: 60,
  source: 'sakenowa',
}

const TAKASHIMIZU_BREWERY: Brewery = {
  breweryId: 60,
  name: 'Akita Shurui Seizo',
  nameKanji: '秋田酒類製造',
  nameRomaji: 'Akita Shurui Seizo',
  areaId: 5,
  source: 'sakenowa',
}

const DASSAI_BRAND: Brand = {
  brandId: 100,
  name: 'Dassai',
  nameKanji: '獺祭',
  nameRomaji: 'Dassai',
  breweryId: 50,
  source: 'sakenowa',
}

const ASAHI_SHUZO: Brewery = {
  breweryId: 50,
  name: 'Asahi Shuzo',
  nameKanji: '旭酒造',
  nameRomaji: 'Asahi Shuzo',
  areaId: 35,
  source: 'sakenowa',
}

// --- Fake executor ----------------------------------------------------

/**
 * Builds a fake `ScannedLabelLookupExecutor` whose three pass
 * operations return canned results. `no_match` is the default for any
 * pass a test doesn't wire, so tests only declare the passes the
 * scenario actually exercises — and the vi.fn spies let us assert which
 * passes ran (the whole point of moving the composition behind a seam).
 */
function fakeExecutor(overrides: {
  byExtraction?: FindSakeByExtractionResult
  byBreweryOnly?: BreweryOnlyLookupResult
  byBrandOnly?: BrandOnlyLookupResult
  byLatinBrewery?: FindSakeByExtractionResult
  siblings?: readonly Brand[]
}): ScannedLabelLookupExecutor {
  const NO_MATCH = { kind: 'no_match', query: { nameJa: '', breweryJa: '' } } as const
  return {
    findByExtraction: vi.fn().mockResolvedValue(overrides.byExtraction ?? NO_MATCH),
    findByBreweryOnly: vi.fn().mockResolvedValue(overrides.byBreweryOnly ?? NO_MATCH),
    findByBrandOnly: vi.fn().mockResolvedValue(overrides.byBrandOnly ?? NO_MATCH),
    findByLatinBrewery: vi.fn().mockResolvedValue(overrides.byLatinBrewery ?? NO_MATCH),
    listSiblings: vi.fn().mockResolvedValue(overrides.siblings ?? []),
  }
}

function label(overrides: Partial<ScannedLabel> = {}): ScannedLabel {
  return { name_ja: '獺祭', brewery_ja: '旭酒造', confidence: 0.95, ...overrides }
}

// --- Confidence-tier gate --------------------------------------------

describe('resolveScannedLabel — confidence-tier gate', () => {
  it('keeps a read the model scored low when brand and brewery both match one catalogue row', async () => {
    // A front label with no brewery on it: a careful model reads the brand,
    // names the maker from what it knows, and scores itself 0.35 for the
    // field it could not see. The catalogue agreeing on both is the evidence.
    const executor = fakeExecutor({ byExtraction: { kind: 'exact', sake: DASSAI_BRAND } })

    const result = await resolveScannedLabel(label({ confidence: 0.35 }), executor)

    expect(result).toEqual({ kind: 'exact', sake: DASSAI_BRAND })
  })

  it('answers low_confidence for a low-scored read that matched on the brand alone', async () => {
    const executor = fakeExecutor({
      byExtraction: {
        kind: 'matched_brand_only',
        sake: DASSAI_BRAND,
        brewery: ASAHI_SHUZO,
        breweryDivergence: { extracted: '存在しない酒造', stored: '旭酒造' },
        query: { nameJa: '獺祭', breweryJa: '存在しない酒造' },
      },
    })

    const result = await resolveScannedLabel(label({ brewery_ja: '存在しない酒造', confidence: 0.4 }), executor)

    expect(result.kind).toBe('low_confidence')
  })

  it('keeps a low-scored read whose brand is part of the one line its brewery matched (a label cut off by the frame)', async () => {
    const executor = fakeExecutor({
      byExtraction: {
        kind: 'matched_brewery_only',
        sake: { ...DASSAI_BRAND, nameKanji: '吉野杉の樽酒' },
        brewery: ASAHI_SHUZO,
        brandDivergence: { extracted: '吉野杉', stored: '吉野杉の樽酒' },
        query: { nameJa: '吉野杉', breweryJa: '旭酒造' },
      },
    })

    const result = await resolveScannedLabel(label({ name_ja: '吉野杉', confidence: 0.3 }), executor)

    expect(result.kind).toBe('matched_brewery_only')
  })

  it('answers low_confidence, not "not in the catalogue", for a low-scored read that matched nothing', async () => {
    const executor = fakeExecutor({})

    const result = await resolveScannedLabel(label({ confidence: 0.4 }), executor)

    expect(result.kind).toBe('low_confidence')
  })

  it('lets a confirm-tier extraction (0.60 boundary) reach the cascade', async () => {
    const executor = fakeExecutor({ byExtraction: { kind: 'exact', sake: DASSAI_BRAND } })

    const result = await resolveScannedLabel(label({ confidence: 0.6 }), executor)

    expect(result.kind).toBe('exact')
    expect(executor.findByExtraction).toHaveBeenCalledWith({ nameJa: '獺祭', breweryJa: '旭酒造' })
  })
})

// --- Placeholder sentinel guard --------------------------------------

describe('resolveScannedLabel — placeholder sentinel guard', () => {
  it('routes a 不明 name_ja to low_confidence even at high confidence (never queries Sakenowa)', async () => {
    const executor = fakeExecutor({})

    const result = await resolveScannedLabel(
      label({ name_ja: '不明', confidence: 0.9 }),
      executor,
    )

    expect(result.kind).toBe('low_confidence')
    expect(executor.findByExtraction).not.toHaveBeenCalled()
  })

  it('routes a placeholder brewery_ja to low_confidence too', async () => {
    const executor = fakeExecutor({})

    const result = await resolveScannedLabel(
      label({ brewery_ja: 'unknown', confidence: 0.9 }),
      executor,
    )

    expect(result.kind).toBe('low_confidence')
    expect(executor.findByExtraction).not.toHaveBeenCalled()
  })
})

// --- Latin-brewery shaping guard -------------------------------------

describe('resolveScannedLabel — a brewery read in Latin script', () => {
  it("resolves an importer's back label through the Latin-brewery lookup, not the kanji cascade", async () => {
    const executor = fakeExecutor({ byLatinBrewery: { kind: 'exact', sake: DASSAI_BRAND } })

    const result = await resolveScannedLabel(
      label({ name_ja: 'DASSAI', brewery_ja: 'Asahi Shuzo Co., Ltd.', confidence: 0.9 }),
      executor,
    )

    expect(result).toEqual({ kind: 'exact', sake: DASSAI_BRAND })
    expect(executor.findByLatinBrewery).toHaveBeenCalledWith({ nameJa: 'DASSAI', breweryJa: 'Asahi Shuzo Co., Ltd.' })
    expect(executor.findByExtraction).not.toHaveBeenCalled()
  })

  it('reports no match when neither the brand nor the Latin brewery is in the catalogue', async () => {
    const executor = fakeExecutor({})

    const result = await resolveScannedLabel(
      label({ name_ja: 'Nohime No Sato', brewery_ja: 'Ginza Berlin', confidence: 0.9 }),
      executor,
    )

    expect(result.kind).toBe('no_match')
  })

  it('lets a Latin name_ja through to the cascade (Latin-only brands match on the 5th pass)', async () => {
    // Latin in the BRAND field is fine — the cascade's Latin pass
    // matches the ~110 Latin-only brands + the romaji column. Only a
    // Latin brewery is a misread signal.
    const executor = fakeExecutor({
      byExtraction: {
        kind: 'matched_brand_only',
        sake: DASSAI_BRAND,
        brewery: ASAHI_SHUZO,
        breweryDivergence: { extracted: '存在しない酒造', stored: '旭酒造' },
        query: { nameJa: 'UMAMI', breweryJa: '旭酒造' },
      },
    })

    const result = await resolveScannedLabel(
      label({ name_ja: 'UMAMI', brewery_ja: '旭酒造' }),
      executor,
    )

    expect(result.kind).toBe('matched_brand_only')
    expect(executor.findByExtraction).toHaveBeenCalledWith({ nameJa: 'UMAMI', breweryJa: '旭酒造' })
  })
})

// --- Single-character hallucination rescue ---------------------------

describe('resolveScannedLabel — single-char hallucination rescue', () => {
  it('rescues a 1-char brand via the brewery-only pass (matched_brewery_only)', async () => {
    const executor = fakeExecutor({
      byBreweryOnly: {
        kind: 'matched_brewery_only',
        sake: TAKASHIMIZU_BRAND,
        brewery: TAKASHIMIZU_BREWERY,
        brandDivergence: { extracted: '梗', stored: '高清水' },
        query: { nameJa: '梗', breweryJa: '高清水酒造' },
      },
    })

    const result = await resolveScannedLabel(
      label({ name_ja: '梗', brewery_ja: '高清水酒造', confidence: 0.75 }),
      executor,
    )

    expect(result.kind).toBe('matched_brewery_only')
    // Single-char guard owns the outcome — the main first-pass cascade
    // is never reached because name_ja is junk.
    expect(executor.findByExtraction).not.toHaveBeenCalled()
    expect(executor.findByBreweryOnly).toHaveBeenCalledWith({ nameJa: '梗', breweryJa: '高清水酒造' })
    // Brewery-only already resolved → field-swap brand-only is not tried.
    expect(executor.findByBrandOnly).not.toHaveBeenCalled()
  })

  it('returns the brewery-only ambiguous list when a 1-char brand resolves to a multi-brand brewery', async () => {
    const executor = fakeExecutor({
      byBreweryOnly: {
        kind: 'ambiguous',
        candidates: [
          { sake: DASSAI_BRAND, brewery: ASAHI_SHUZO },
          { sake: TAKASHIMIZU_BRAND, brewery: TAKASHIMIZU_BREWERY },
        ],
        query: { nameJa: '幻', breweryJa: '旭酒造' },
      },
    })

    const result = await resolveScannedLabel(
      label({ name_ja: '幻', brewery_ja: '旭酒造', confidence: 0.75 }),
      executor,
    )

    expect(result.kind).toBe('ambiguous')
    expect(executor.findByBrandOnly).not.toHaveBeenCalled()
  })

  it('falls back to the field-swap brand-only pass when brewery-only misses (matched_brand_only)', async () => {
    // The model put the real brand in the brewery field. brewery-only
    // misses; brand-only on brewery_ja hits.
    const executor = fakeExecutor({
      byBreweryOnly: { kind: 'no_match', query: { nameJa: '梗', breweryJa: '獺祭' } },
      byBrandOnly: {
        kind: 'matched_brand_only',
        sake: DASSAI_BRAND,
        brewery: ASAHI_SHUZO,
        breweryDivergence: { extracted: '獺祭', stored: '旭酒造' },
        query: { nameJa: '獺祭', breweryJa: '獺祭' },
      },
    })

    const result = await resolveScannedLabel(
      label({ name_ja: '梗', brewery_ja: '獺祭', confidence: 0.75 }),
      executor,
    )

    expect(result.kind).toBe('matched_brand_only')
    // Field-swap tries the BREWERY field as the brand.
    expect(executor.findByBrandOnly).toHaveBeenCalledWith({ nameJa: '獺祭', breweryJa: '獺祭' })
    expect(executor.findByExtraction).not.toHaveBeenCalled()
  })

  it('returns the field-swap ambiguous list when brand-only on brewery_ja is ambiguous', async () => {
    const executor = fakeExecutor({
      byBreweryOnly: { kind: 'no_match', query: { nameJa: '山田錦', breweryJa: '白鹿' } },
      byBrandOnly: {
        kind: 'ambiguous',
        candidates: [
          { sake: DASSAI_BRAND, brewery: ASAHI_SHUZO },
          { sake: TAKASHIMIZU_BRAND, brewery: TAKASHIMIZU_BREWERY },
        ],
        query: { nameJa: '白鹿', breweryJa: '白鹿' },
      },
    })

    const result = await resolveScannedLabel(
      label({ name_ja: '山', brewery_ja: '白鹿', confidence: 0.75 }),
      executor,
    )

    expect(result.kind).toBe('ambiguous')
  })

  it('routes to low_confidence when the 1-char guard fires and both rescues miss', async () => {
    const executor = fakeExecutor({
      byBreweryOnly: { kind: 'no_match', query: { nameJa: '梗', breweryJa: '存在しない' } },
      byBrandOnly: { kind: 'no_match', query: { nameJa: '存在しない', breweryJa: '存在しない' } },
    })

    const result = await resolveScannedLabel(
      label({ name_ja: '梗', brewery_ja: '存在しない', confidence: 0.7 }),
      executor,
    )

    expect(result.kind).toBe('low_confidence')
    expect(executor.findByBreweryOnly).toHaveBeenCalled()
    expect(executor.findByBrandOnly).toHaveBeenCalled()
    expect(executor.findByExtraction).not.toHaveBeenCalled()
  })
})

// --- Guard ordering ---------------------------------------------------

describe('resolveScannedLabel — guard ordering', () => {
  it('lets the Latin-brewery guard win over the single-char guard (a 1-char name + Latin brewery is low_confidence, no rescue)', async () => {
    // Ordering is load-bearing: brewery_ja is checked before name_ja
    // length. A 1-char name with a Latin brewery must short-circuit to
    // low_confidence WITHOUT attempting the brewery-only rescue (which
    // would query a brewery the model clearly misread).
    const executor = fakeExecutor({})

    const result = await resolveScannedLabel(
      label({ name_ja: '梗', brewery_ja: 'YAMADA', confidence: 0.9 }),
      executor,
    )

    expect(result.kind).toBe('low_confidence')
    expect(executor.findByBreweryOnly).not.toHaveBeenCalled()
    expect(executor.findByBrandOnly).not.toHaveBeenCalled()
  })

  it('lets the placeholder guard win over the single-char guard', async () => {
    const executor = fakeExecutor({})

    const result = await resolveScannedLabel(
      label({ name_ja: '梗', brewery_ja: '不明', confidence: 0.9 }),
      executor,
    )

    expect(result.kind).toBe('low_confidence')
    expect(executor.findByBreweryOnly).not.toHaveBeenCalled()
  })
})

// --- Main cascade passthrough ----------------------------------------

describe('resolveScannedLabel — main cascade passthrough', () => {
  it('passes a clean multi-char Japanese extraction straight to the 5-pass cascade', async () => {
    const executor = fakeExecutor({ byExtraction: { kind: 'exact', sake: DASSAI_BRAND } })

    const result = await resolveScannedLabel(label(), executor)

    expect(result.kind).toBe('exact')
    expect(executor.findByExtraction).toHaveBeenCalledWith({ nameJa: '獺祭', breweryJa: '旭酒造' })
    // The cascade owns first-pass → brand-only → brewery-only →
    // field-swap → Latin internally; the resolver does not pre-run any
    // of the standalone passes for a normal extraction.
    expect(executor.findByBreweryOnly).not.toHaveBeenCalled()
    expect(executor.findByBrandOnly).not.toHaveBeenCalled()
  })

  it('propagates a no_match from the cascade (distinct from the guards low_confidence)', async () => {
    const executor = fakeExecutor({
      byExtraction: { kind: 'no_match', query: { nameJa: '獺祭', breweryJa: '旭酒造' } },
    })

    const result = await resolveScannedLabel(label(), executor)

    // no_match ("not in our catalogue") must stay distinct from
    // low_confidence ("couldn't read the label") — the two drive
    // different UI copy.
    expect(result.kind).toBe('no_match')
  })
})

// --- The label's other names -----------------------------------------

describe("resolveScannedLabel — the label's other names", () => {
  const FUKUJU: Brand = { brandId: 769, name: '福寿', nameKanji: '福寿', nameRomaji: 'Fukuju', breweryId: 568, source: 'sakenowa' }
  const AWASAKI: Brand = { brandId: 3434, name: 'あわ咲き', nameKanji: 'あわ咲き', nameRomaji: 'Awasaki', breweryId: 568, source: 'sakenowa' }
  const NINKIICHI: Brand = { brandId: 191, name: '人気一', nameKanji: '人気一', nameRomaji: 'Ninkiichi', breweryId: 128, source: 'sakenowa' }
  const GOLD_NINKI: Brand = { brandId: 190, name: 'ゴールド人気', nameKanji: 'ゴールド人気', nameRomaji: 'Gold Ninki', breweryId: 128, source: 'sakenowa' }

  it('on an importer label, lands on the sub-line it names, not the brand: "FUKUJU" with "Awasaki Sparkling" is あわ咲き', async () => {
    const executor = fakeExecutor({ byLatinBrewery: { kind: 'exact', sake: FUKUJU }, siblings: [AWASAKI] })

    const result = await resolveScannedLabel(
      label({ name_ja: 'FUKUJU', brewery_ja: 'Kobe Shushinkan', other_names: ['Awasaki Sparkling'] }),
      executor,
    )

    expect(result).toEqual({ kind: 'exact', sake: AWASAKI })
  })

  it('prefers the sub-line printed in Japanese to a house mark read in Latin: "FUKUJU" beside あわ咲き', async () => {
    const executor = fakeExecutor({ byExtraction: { kind: 'exact', sake: FUKUJU }, siblings: [AWASAKI] })

    const result = await resolveScannedLabel(
      label({ name_ja: 'FUKUJU', brewery_ja: '神戸酒心館', other_names: ['あわ咲き'] }),
      executor,
    )

    expect(result).toEqual({ kind: 'exact', sake: AWASAKI })
  })

  it('lets a product name pick its line when only the voicing differs: TARUSAKE for a stored Taruzake', async () => {
    const CHORYO: Brand = { brandId: 797, name: '長龍', nameKanji: '長龍', nameRomaji: 'Choryo', breweryId: 594, source: 'sakenowa' }
    const TARUZAKE: Brand = { brandId: 2120, name: '吉野杉の樽酒', nameKanji: '吉野杉の樽酒', nameRomaji: 'Yoshinosugi no Taruzake', breweryId: 594, source: 'sakenowa' }
    const executor = fakeExecutor({ byLatinBrewery: { kind: 'exact', sake: CHORYO }, siblings: [TARUZAKE] })

    const result = await resolveScannedLabel(
      label({ name_ja: 'CHORYO', brewery_ja: 'CHORYO', other_names: ['YOSHINOSUGI NO TARUSAKE'], confidence: 0.4 }),
      executor,
    )

    expect(result).toEqual({ kind: 'exact', sake: TARUZAKE })
  })

  it('does not take a product word that is only part of a stored name for that line: ゆき is not 雪の十和田', async () => {
    const TOWADA: Brand = { brandId: 1786, name: '雪の十和田', nameKanji: '雪の十和田', nameRomaji: 'Yuki no Towada', breweryId: 61, source: 'sakenowa' }
    const KITAAKITA: Brand = { brandId: 89, name: '北秋田', nameKanji: '北秋田', nameRomaji: 'Kitaakita', breweryId: 61, source: 'sakenowa' }
    const list: FindSakeByExtractionResult = {
      kind: 'ambiguous',
      candidates: [
        { sake: KITAAKITA, brewery: ASAHI_SHUZO },
        { sake: TOWADA, brewery: ASAHI_SHUZO },
      ],
      query: { nameJa: '雪', breweryJa: '北鹿' },
    }
    const executor = fakeExecutor({ byBreweryOnly: list })

    const result = await resolveScannedLabel(label({ name_ja: '雪', brewery_ja: '北鹿', other_names: ['ゆき', 'YUKI'] }), executor)

    // Not 雪の十和田 — and since nothing printed is one of the lines, not a
    // list of them either: the catalogue does not have this sake.
    expect(result.kind).toBe('no_match')
  })

  it('on a Japanese label, keeps the name the model chose when another name is a sibling line', async () => {
    const executor = fakeExecutor({ byExtraction: { kind: 'exact', sake: FUKUJU }, siblings: [AWASAKI] })

    const result = await resolveScannedLabel(label({ name_ja: '福寿', brewery_ja: '神戸酒心館', other_names: ['あわ咲き'] }), executor)

    expect(result).toEqual({ kind: 'exact', sake: FUKUJU })
  })

  it('stays on the matched sake when no sibling carries any of the other names', async () => {
    const executor = fakeExecutor({ byLatinBrewery: { kind: 'exact', sake: FUKUJU }, siblings: [AWASAKI] })

    const result = await resolveScannedLabel(
      label({ name_ja: 'FUKUJU', brewery_ja: 'Kobe Shushinkan', other_names: ['Kobe Classic'] }),
      executor,
    )

    expect(result).toEqual({ kind: 'exact', sake: FUKUJU })
  })

  const brandOnly = (sake: Brand): FindSakeByExtractionResult => ({
    kind: 'matched_brand_only',
    sake,
    brewery: ASAHI_SHUZO,
    breweryDivergence: { extracted: '存在しない酒造', stored: '旭酒造' },
    query: { nameJa: sake.nameKanji, breweryJa: '存在しない酒造' },
  })

  it('keeps a low-scored brand-only match when the label names that sake again in another script', async () => {
    // 不動 in foil, the brewery guessed wrong, and "Fudoh" printed underneath.
    const FUDO: Brand = { brandId: 312, name: '不動', nameKanji: '不動', nameRomaji: 'Fudō', breweryId: 224, source: 'sakenowa' }
    const executor = fakeExecutor({ byExtraction: brandOnly(FUDO) })

    const result = await resolveScannedLabel(
      label({ name_ja: '不動', brewery_ja: '存在しない酒造', other_names: ['Fudoh'], confidence: 0.55 }),
      executor,
    )

    expect(result.kind).toBe('matched_brand_only')
  })

  it('keeps a low-scored brand-only match when another name on the label is a sibling line of the same brewery', async () => {
    const BEKKAKU: Brand = { brandId: 69, name: '別格', nameKanji: '別格', nameRomaji: 'Bekkaku', breweryId: 48, source: 'sakenowa' }
    const RYOKOKU: Brand = { brandId: 3686, name: '両國', nameKanji: '両國', nameRomaji: 'Ryokoku', breweryId: 48, source: 'sakenowa' }
    const executor = fakeExecutor({ byExtraction: brandOnly(BEKKAKU), siblings: [RYOKOKU] })

    const result = await resolveScannedLabel(
      label({ name_ja: '別格', brewery_ja: '存在しない酒造', other_names: ['両国'], confidence: 0.55 }),
      executor,
    )

    expect(result).toMatchObject({ kind: 'matched_brand_only', sake: BEKKAKU })
  })

  it('still answers low_confidence for a low-scored brand-only match the label does not name twice', async () => {
    const executor = fakeExecutor({ byExtraction: brandOnly(FUKUJU) })

    const result = await resolveScannedLabel(
      label({ name_ja: '福寿', brewery_ja: '存在しない酒造', other_names: ['純米吟醸'], confidence: 0.55 }),
      executor,
    )

    expect(result.kind).toBe('low_confidence')
  })

  it('settles a list on the candidate another name names', async () => {
    const executor = fakeExecutor({
      byExtraction: {
        kind: 'ambiguous',
        candidates: [
          { sake: NINKIICHI, brewery: ASAHI_SHUZO },
          { sake: GOLD_NINKI, brewery: ASAHI_SHUZO },
        ],
        query: { nameJa: 'NINKI', breweryJa: '人気酒造' },
      },
    })

    // ニンキイチ is no row's name as written; sounded out it is "Ninkiichi".
    const result = await resolveScannedLabel(label({ name_ja: 'NINKI', other_names: ['ニンキイチ'] }), executor)

    expect(result).toEqual({ kind: 'exact', sake: NINKIICHI })
  })

  describe('a sake the catalogue lacks, from a brewery it has', () => {
    const HOKUSHIKA: Brewery = { breweryId: 61, name: '北鹿', nameKanji: '北鹿', nameRomaji: 'Hokushika', areaId: 5, source: 'sakenowa' }
    const line = (brandId: number, nameKanji: string, nameRomaji: string): Brand => ({
      brandId, name: nameKanji, nameKanji, nameRomaji, breweryId: 61, source: 'sakenowa',
    })
    const KITAAKITA = line(89, '北秋田', 'Kitaakita')
    const TOWADA = line(1786, '雪の十和田', 'Yuki no Towada')
    // The list shows the visitor a few lines; the brewery has more.
    const lines = (query: { nameJa: string; breweryJa: string }): FindSakeByExtractionResult => ({
      kind: 'ambiguous',
      candidates: [{ sake: KITAAKITA, brewery: HOKUSHIKA }],
      query,
    })

    it('answers "not in the catalogue" when nothing the label prints is one of the brewery\'s lines', async () => {
      const query = { nameJa: '隠し吟醸', breweryJa: '北鹿' }
      const executor = fakeExecutor({ siblings: [TOWADA], byExtraction: lines(query) })

      const result = await resolveScannedLabel(label({ name_ja: '隠し吟醸', brewery_ja: '北鹿', other_names: ['濃姫の里'] }), executor)

      expect(result).toEqual({ kind: 'no_match', query })
    })

    it('keeps the list when the name that was read is only the brewery\'s own', async () => {
      const executor = fakeExecutor({ siblings: [TOWADA], byLatinBrewery: lines({ nameJa: 'HOKUSHIKA', breweryJa: 'Hokushika' }) })

      const result = await resolveScannedLabel(
        label({ name_ja: 'HOKUSHIKA', brewery_ja: 'Hokushika', other_names: ['Sparkling'] }),
        executor,
      )

      expect(result.kind).toBe('ambiguous')
    })

    it('says "not in the catalogue" with no second name too, when the name read is none of the brewery\'s lines (#420)', async () => {
      // 京極 by 二世古酒造, once the catalogue had two sakes of that brewery:
      // "Which one is it?" between two sakes the label fits neither of.
      const executor = fakeExecutor({ siblings: [TOWADA], byExtraction: lines({ nameJa: '隠し吟醸', breweryJa: '北鹿' }) })

      const result = await resolveScannedLabel(label({ name_ja: '隠し吟醸', brewery_ja: '北鹿' }), executor)

      expect(result.kind).toBe('no_match')
    })

    it('keeps the list when the one name read is a single character, which is a misread', async () => {
      // A single character never reaches the full lookup: the brewery alone is.
      const executor = fakeExecutor({ siblings: [TOWADA], byBreweryOnly: {
          kind: 'ambiguous',
          candidates: [{ sake: KITAAKITA, brewery: HOKUSHIKA }],
          query: { nameJa: '隠', breweryJa: '北鹿' },
        },
      })

      const result = await resolveScannedLabel(label({ name_ja: '隠', brewery_ja: '北鹿' }), executor)

      expect(result.kind).toBe('ambiguous')
    })

    it('keeps the list when what was read is part of a line the list does not even show', async () => {
      const executor = fakeExecutor({ siblings: [TOWADA], byExtraction: lines({ nameJa: '十和田', breweryJa: '北鹿' }) })

      const result = await resolveScannedLabel(label({ name_ja: '十和田', brewery_ja: '北鹿', other_names: ['TOWADA'] }), executor)

      expect(result.kind).toBe('ambiguous')
    })
  })

  it('tries the other names as the brand when the brand that was read finds nothing', async () => {
    const executor = fakeExecutor({})
    vi.mocked(executor.findByExtraction).mockImplementation(async (query) =>
      query.nameJa === 'ハナトモエ' ? { kind: 'exact', sake: DASSAI_BRAND } : { kind: 'no_match', query },
    )

    const result = await resolveScannedLabel(label({ name_ja: '樽丸', other_names: ['ハナトモエ'] }), executor)

    expect(result).toEqual({ kind: 'exact', sake: DASSAI_BRAND })
  })
})

describe('resolveScannedLabel — an unlisted sake of a brewery the catalogue knows (#420)', () => {
  const NISEKO_BREWERY: Brewery = {
    breweryId: 923,
    name: '二世古酒造',
    nameKanji: '二世古酒造',
    nameRomaji: 'Niseko Shuzo',
    areaId: 1,
    source: 'sakenowa',
  }
  const NISEKO: Brand = { brandId: 1611, name: 'Niseko', nameKanji: '二世古', nameRomaji: 'Niseko', breweryId: 923, source: 'sakenowa' }
  const breweryOnly = (extracted: string, sake: Brand = NISEKO): FindSakeByExtractionResult => ({
    kind: 'matched_brewery_only',
    sake,
    brewery: NISEKO_BREWERY,
    brandDivergence: { extracted, stored: '二世古' },
    query: { nameJa: extracted, breweryJa: '二世古酒造' },
  })

  it('answers "not in the catalogue" when nothing on the label names the brewery’s one sake', async () => {
    const result = await resolveScannedLabel(
      label({ name_ja: '京極', brewery_ja: '二世古酒造', confidence: 0.8, other_names: ['名水辛口'] }),
      fakeExecutor({ byExtraction: breweryOnly('京極') }),
    )
    expect(result.kind).toBe('no_match')
  })

  it('keeps the brewery’s sake when the name read is part of its name', async () => {
    const result = await resolveScannedLabel(
      label({ name_ja: '世古', brewery_ja: '二世古酒造', confidence: 0.8 }),
      fakeExecutor({ byExtraction: breweryOnly('世古') }),
    )
    expect(result.kind).toBe('matched_brewery_only')
  })

  it('keeps it when the name read is the brewery’s own house name', async () => {
    const result = await resolveScannedLabel(
      label({ name_ja: '二世古', brewery_ja: '二世古酒造', confidence: 0.8 }),
      fakeExecutor({ byExtraction: breweryOnly('二世古', { ...NISEKO, nameKanji: 'にせこ' }) }),
    )
    expect(result.kind).toBe('matched_brewery_only')
  })
})
