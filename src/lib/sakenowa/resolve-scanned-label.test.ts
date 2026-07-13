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
} from './lookup'

// resolveScannedLabel owns the WHOLE label-matching job — every
// pre-lookup guard (confidence-tier gate, placeholder sentinel,
// Latin-brewery shaping, single-character hallucination rescue) AND the
// composition that drives the Sakenowa pass cascade. Before #198 these
// guards + the single-char brewery-only → field-swap composition lived
// in scan-action.ts and were only reachable through a vision mock and
// the rate-limit gate. Here we inject a fake executor and drive the
// guard × cascade interactions directly — no vision model, no
// rate-limit, no Postgres. The passes themselves are covered against
// real Postgres in `lookup.integration.test.ts`.

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
}): ScannedLabelLookupExecutor {
  const NO_MATCH = { kind: 'no_match', query: { nameJa: '', breweryJa: '' } } as const
  return {
    findByExtraction: vi.fn().mockResolvedValue(overrides.byExtraction ?? NO_MATCH),
    findByBreweryOnly: vi.fn().mockResolvedValue(overrides.byBreweryOnly ?? NO_MATCH),
    findByBrandOnly: vi.fn().mockResolvedValue(overrides.byBrandOnly ?? NO_MATCH),
  }
}

function label(overrides: Partial<ScannedLabel> = {}): ScannedLabel {
  return { name_ja: '獺祭', brewery_ja: '旭酒造', confidence: 0.95, ...overrides }
}

// --- Confidence-tier gate --------------------------------------------

describe('resolveScannedLabel — confidence-tier gate', () => {
  it('routes a retry-tier extraction to low_confidence without running any lookup', async () => {
    const executor = fakeExecutor({})

    const result = await resolveScannedLabel(label({ confidence: 0.4 }), executor)

    expect(result.kind).toBe('low_confidence')
    // The whole point of the retry gate: Sakenowa is never pinged when
    // the model isn't confident enough to commit to a (name, brewery).
    expect(executor.findByExtraction).not.toHaveBeenCalled()
    expect(executor.findByBreweryOnly).not.toHaveBeenCalled()
    expect(executor.findByBrandOnly).not.toHaveBeenCalled()
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

describe('resolveScannedLabel — Latin-brewery guard', () => {
  it('routes a Latin-only brewery_ja to low_confidence (brewery names are Japanese script)', async () => {
    const executor = fakeExecutor({})

    const result = await resolveScannedLabel(
      label({ brewery_ja: 'YAMADA NISHIKI', confidence: 0.9 }),
      executor,
    )

    expect(result.kind).toBe('low_confidence')
    expect(executor.findByExtraction).not.toHaveBeenCalled()
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
