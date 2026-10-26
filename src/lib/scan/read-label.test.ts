import { describe, expect, it, vi } from 'vitest'
import { MockLanguageModelV3 } from 'ai/test'
import { createAnthropicHaikuProvider } from '@/lib/ai/vision/anthropic-haiku-provider'
import type { VisionProvider } from '@/lib/ai/vision/vision-provider'
import type { Locale } from '@/i18n/routing'
import { DebugLog, runWithDebugLog } from '@/lib/debug/debug-log'
import type { NearestBrand } from '@/lib/sakenowa/nearest-brands'
import type { ResolveScannedLabelResult } from '@/lib/sakenowa/resolve-scanned-label'
import type { Brand } from '@/lib/schemas/brand'
import type { Brewery } from '@/lib/schemas/brewery'
import type { EarlierScanRead } from '@/lib/schemas/earlier-scan-read'
import { LabelScanExtractionSchema } from '@/lib/schemas/label-scan-extraction'
import { readLabel, type LabelCatalogue, type ReadLabelDeps } from './read-label'

// The label-reading pipeline against fake models and a fake catalogue: no
// module mocks. The catalogue's own matching is tested in
// `resolve-scanned-label.test.ts`, the nearest-sake ranking in
// `nearest-brands.test.ts`, and the two-photo rules in
// `resolve-with-earlier-read.test.ts`; here they are what the fakes answer.

// --- Fixtures ---------------------------------------------------------

const DASSAI: Brand = { brandId: 100, name: 'Dassai', nameKanji: '獺祭', nameRomaji: 'Dassai', breweryId: 50, source: 'sakenowa' }
const ASAHI_SHUZO: Brewery = { breweryId: 50, name: 'Asahi Shuzo', nameKanji: '旭酒造', nameRomaji: 'Asahi Shuzo', areaId: 35, source: 'sakenowa' }
const TAKASHIMIZU: Brand = { brandId: 200, name: 'Takashimizu', nameKanji: '高清水', nameRomaji: 'Takashimizu', breweryId: 60, source: 'sakenowa' }
const AKITA_SHURUI: Brewery = { breweryId: 60, name: 'Akita Shurui Seizo', nameKanji: '秋田酒類製造', nameRomaji: 'Akita Shurui Seizo', areaId: 5, source: 'sakenowa' }
const KIKU: Brand = { brandId: 300, name: 'Kiku-Masamune', nameKanji: '菊正宗', nameRomaji: 'Kiku-Masamune', breweryId: 70, source: 'sakenowa' }
const KIKU_BREWERY: Brewery = { breweryId: 70, name: 'Kiku-Masamune Sake Brewing', nameKanji: '菊正宗酒造', nameRomaji: 'Kiku-Masamune Sake Brewing', areaId: 27, source: 'sakenowa' }

const DASSAI_READ = { name_ja: '獺祭', brewery_ja: '旭酒造', confidence: 0.95 }
const EARLIER_READ: EarlierScanRead = { name_ja: '人気一', brewery_ja: '人気酒造', other_names: [], confidence: 0.7 }

const EXACT_DASSAI: ResolveScannedLabelResult = { kind: 'exact', sake: DASSAI }
const NO_MATCH: ResolveScannedLabelResult = { kind: 'no_match', query: { nameJa: '獺祭', breweryJa: '旭酒造' } }

const PHOTO = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })

// --- Fakes ------------------------------------------------------------

/** A vision provider that reads every photo as `read` (schema-parsed, as a real one returns it). */
function readsAs(read: Record<string, unknown>): VisionProvider {
  return { extractLabel: vi.fn(async () => LabelScanExtractionSchema.parse({ source: 'llm_extracted', ...read })) }
}

function throws(err: Error): VisionProvider {
  return { extractLabel: vi.fn(async () => Promise.reject(err)) }
}

/** A tier that must not be asked: building it fails the test. */
function neverAsked(): () => VisionProvider {
  return () => {
    throw new Error('this tier was not supposed to be asked')
  }
}

function fakeCatalogue(answers: Partial<LabelCatalogue> & { resolved?: ResolveScannedLabelResult[] } = {}) {
  const { resolved = [], ...rest } = answers
  const queue = [...resolved]
  return {
    resolve: vi.fn(async () => (queue.length > 1 ? queue.shift()! : (queue[0] ?? NO_MATCH))),
    breweryOf: vi.fn(async (): Promise<Brewery | null> => ASAHI_SHUZO),
    flavorChartOf: vi.fn(async () => null),
    nearest: vi.fn(async (): Promise<NearestBrand[]> => []),
    withEarlierRead: vi.fn(async (): Promise<{ sake: Brand } | null> => null),
    ...rest,
  } satisfies LabelCatalogue
}

function deps(tier1: VisionProvider | (() => VisionProvider), tier2: VisionProvider | (() => VisionProvider), catalogue: LabelCatalogue): ReadLabelDeps {
  return {
    tier1: typeof tier1 === 'function' ? tier1 : () => tier1,
    tier2: typeof tier2 === 'function' ? tier2 : () => tier2,
    tier2Name: 'tier-2-model',
    catalogue,
  }
}

function scan(d: ReadLabelDeps, { locale = 'en', earlierRead = null }: { locale?: Locale; earlierRead?: EarlierScanRead | null } = {}) {
  return readLabel({ image: PHOTO, locale, earlierRead }, d)
}

// --- One model's read, landed --------------------------------------------

describe('readLabel — where a read lands', () => {
  it('opens the matched sake with its romaji and brewery when the label is a sure match', async () => {
    const catalogue = fakeCatalogue({ resolved: [EXACT_DASSAI] })

    const { state } = await scan(deps(readsAs(DASSAI_READ), neverAsked(), catalogue))

    expect(state).toMatchObject({
      status: 'matched',
      brandId: 100,
      sakeHref: '/en/sake/100?from=scan',
      sakeRomaji: 'Dassai',
      breweryRomaji: 'Asahi Shuzo',
      otherCandidates: [],
    })
    expect(catalogue.breweryOf).toHaveBeenCalledWith(100)
    expect(catalogue.flavorChartOf).toHaveBeenCalledWith(100)
  })

  it('lists the other candidates under a best guess, never the match itself', async () => {
    const catalogue = fakeCatalogue({
      resolved: [EXACT_DASSAI],
      nearest: vi.fn(async () => [
        { row: { brandId: 99, nameKanji: '獺祭X', nameRomaji: null, breweryKanji: '旭酒造', breweryRomaji: null, areaId: null }, reason: 'both' as const, sameBrewery: true },
      ]),
    })

    const { state } = await scan(deps(readsAs({ ...DASSAI_READ, confidence: 0.7 }), neverAsked(), catalogue))

    expect(catalogue.nearest).toHaveBeenCalledWith({ name: '獺祭', brewery: '旭酒造' }, { exclude: 100 })
    expect(state.status === 'matched' && state.otherCandidates).toEqual([
      expect.objectContaining({ brandId: 99, reason: 'both', sameBrewery: true, prefectureName: null }),
    ])
  })

  it('does not look for other candidates behind a sure match', async () => {
    const catalogue = fakeCatalogue({ resolved: [EXACT_DASSAI] })

    await scan(deps(readsAs(DASSAI_READ), neverAsked(), catalogue))

    expect(catalogue.nearest).not.toHaveBeenCalled()
  })

  it('offers the nearest catalogue sakes when nothing matched, so the visitor is not at a dead end', async () => {
    const catalogue = fakeCatalogue({
      resolved: [NO_MATCH],
      nearest: vi.fn(async () => [
        { row: { brandId: 7, nameKanji: '獺祭', nameRomaji: 'Dassai', breweryKanji: '獺祭', breweryRomaji: null, areaId: 35 }, reason: 'name' as const, sameBrewery: false },
      ]),
    })

    const { state } = await scan(deps(readsAs(DASSAI_READ), readsAs(DASSAI_READ), catalogue))

    expect(state.status).toBe('no_match')
    expect(state.status === 'no_match' && state.candidates).toEqual([
      expect.objectContaining({ brandId: 7, nameKanji: '獺祭', nameRomaji: 'Dassai', prefectureName: 'Yamaguchi', reason: 'name', sakeHref: '/en/sake/7?from=scan' }),
    ])
    // Asked once, for the answer the visitor sees — not for tier 1's discarded one.
    expect(catalogue.nearest).toHaveBeenCalledTimes(1)
  })

  it('shows the brewery the label names beside the one the catalogue has, when only the brand matched', async () => {
    const catalogue = fakeCatalogue({
      resolved: [{
        kind: 'matched_brand_only',
        sake: DASSAI,
        brewery: ASAHI_SHUZO,
        breweryDivergence: { extracted: '別の蔵', stored: '旭酒造' },
        query: { nameJa: '獺祭', breweryJa: '別の蔵' },
      }],
    })

    const { state } = await scan(deps(readsAs(DASSAI_READ), readsAs(DASSAI_READ), catalogue))

    expect(state).toMatchObject({
      status: 'matched_brand_only',
      brandId: 100,
      sakeHref: '/en/sake/100?from=scan',
      breweryDivergence: { extracted: '別の蔵', stored: '旭酒造', storedRomaji: 'Asahi Shuzo' },
      sakeKanji: '獺祭',
      sakeRomaji: 'Dassai',
    })
  })

  it('writes the brand as the bottle prints it when that is an old form of the catalogue’s kanji', async () => {
    const zao: Brand = { ...DASSAI, brandId: 400, nameKanji: '藏王', nameRomaji: 'Zao' }
    const catalogue = fakeCatalogue({
      resolved: [{
        kind: 'matched_brand_only',
        sake: zao,
        brewery: ASAHI_SHUZO,
        breweryDivergence: { extracted: '別の蔵', stored: '旭酒造' },
        query: { nameJa: '蔵王', breweryJa: '別の蔵' },
      }],
    })
    const read = readsAs({ ...DASSAI_READ, name_ja: '蔵王' })

    const { state } = await scan(deps(read, read, catalogue))

    expect(state.status === 'matched_brand_only' && state.sakeKanji).toBe('蔵王')
  })

  it('shows the brand the label names beside the catalogue’s, when only the brewery matched', async () => {
    const catalogue = fakeCatalogue({
      resolved: [{
        kind: 'matched_brewery_only',
        sake: TAKASHIMIZU,
        brewery: AKITA_SHURUI,
        brandDivergence: { extracted: '寺田', stored: '高清水' },
        query: { nameJa: '寺田', breweryJa: '高清水酒造' },
      }],
    })
    const read = readsAs({ name_ja: '寺田', brewery_ja: '高清水酒造', confidence: 0.9 })

    const { state } = await scan(deps(read, read, catalogue))

    expect(state).toMatchObject({
      status: 'matched_brewery_only',
      brandId: 200,
      brandDivergence: { extracted: '寺田', stored: '高清水', storedRomaji: 'Takashimizu' },
      breweryRomaji: 'Akita Shurui Seizo',
    })
  })

  it('lists every sake the label could be, each linking in the visitor’s language with its prefecture', async () => {
    const catalogue = fakeCatalogue({
      resolved: [{
        kind: 'ambiguous',
        candidates: [{ sake: DASSAI, brewery: ASAHI_SHUZO }, { sake: KIKU, brewery: KIKU_BREWERY }],
        query: { nameJa: '菊正宗', breweryJa: '菊正宗酒造' },
      }],
    })
    const read = readsAs({ name_ja: '菊正宗', brewery_ja: '菊正宗酒造', confidence: 0.9 })

    const { state } = await scan(deps(read, read, catalogue), { locale: 'de' })

    expect(state.status).toBe('ambiguous')
    if (state.status !== 'ambiguous') return
    expect(state.candidates).toEqual([
      expect.objectContaining({ sakeHref: '/de/sake/100?from=scan', nameKanji: '獺祭', breweryRomaji: 'Asahi Shuzo', prefectureName: 'Yamaguchi' }),
      expect.objectContaining({ sakeHref: '/de/sake/300?from=scan', breweryKanji: '菊正宗酒造', prefectureName: 'Osaka' }),
    ])
  })

  it('asks for another photo when neither model reads the label clearly', async () => {
    const catalogue = fakeCatalogue({ resolved: [{ kind: 'low_confidence' }] })
    const read = readsAs({ ...DASSAI_READ, confidence: 0.4 })

    const { state, trace } = await scan(deps(read, read, catalogue))

    expect(state.status).toBe('low_confidence')
    expect(trace).toEqual({ tier1Status: 'low_confidence', tier2Used: true })
    expect(catalogue.resolve).toHaveBeenCalledTimes(2)
  })

  it('asks for another side without asking the catalogue when the photo shows no writing', async () => {
    const catalogue = fakeCatalogue()
    const read = readsAs({ ...DASSAI_READ, legibility: 'no_text' })

    const { state } = await scan(deps(read, read, catalogue))

    expect(state.status).toBe('low_confidence')
    expect(catalogue.resolve).not.toHaveBeenCalled()
  })

  it('says the scan failed, naming only the error kind, when both models throw', async () => {
    const catalogue = fakeCatalogue()

    const { state } = await scan(deps(throws(new Error('anthropic 5xx')), throws(new Error('anthropic 5xx')), catalogue))

    expect(state).toEqual({ status: 'extraction_failed', reason: 'Error' })
    expect(catalogue.resolve).not.toHaveBeenCalled()
  })

  it('says the scan failed when the catalogue is down on a match, rather than crashing', async () => {
    const catalogue = fakeCatalogue({ resolved: [EXACT_DASSAI], breweryOf: vi.fn(async () => Promise.reject(new Error('db down'))) })

    const { state } = await scan(deps(readsAs(DASSAI_READ), readsAs(DASSAI_READ), catalogue))

    expect(state).toEqual({ status: 'extraction_failed', reason: 'Error' })
  })
})

// --- The two-tier rule -----------------------------------------------------

describe('readLabel — the cheap model first, the better one when its answer does not stand', () => {
  it('keeps a clean tier-1 match and never builds tier 2 (cost protection)', async () => {
    const { state, trace } = await scan(deps(readsAs(DASSAI_READ), neverAsked(), fakeCatalogue({ resolved: [EXACT_DASSAI] })))

    expect(state.status).toBe('matched')
    expect(trace).toEqual({ tier1Status: 'matched', tier2Used: false })
  })

  it('takes tier 2’s match when tier 1 found nothing', async () => {
    const tier1 = readsAs({ ...DASSAI_READ, name_ja: '獺祭偽' })
    const tier2 = readsAs(DASSAI_READ)
    const catalogue = fakeCatalogue({ resolved: [NO_MATCH, EXACT_DASSAI] })

    const { state, trace } = await scan(deps(tier1, tier2, catalogue))

    expect(state).toMatchObject({ status: 'matched', brandId: 100, breweryRomaji: 'Asahi Shuzo' })
    expect(trace).toEqual({ tier1Status: 'no_match', tier2Used: true })
    expect(tier2.extractLabel).toHaveBeenCalledWith(PHOTO)
  })

  it('says in the debug log that tier 2 was asked, and why', async () => {
    const log = new DebugLog()

    await runWithDebugLog(log, () => scan(deps(readsAs(DASSAI_READ), readsAs(DASSAI_READ), fakeCatalogue({ resolved: [NO_MATCH] }))))

    expect(log.toArray()).toContainEqual(expect.objectContaining({
      source: 'ScanAction',
      level: 'warn',
      message: 'tier-1 (Haiku) returned no_match — retrying with tier-2 (tier-2-model)',
    }))
  })

  it('asks tier 2 when tier 1 matched on a brewery it says the photo does not print', async () => {
    // A front label with the brand alone: tier 1 misreads the brand and
    // supplies that brand's brewery, so both agree with the catalogue.
    const catalogue = fakeCatalogue({ resolved: [EXACT_DASSAI, { kind: 'exact', sake: { ...DASSAI, brandId: 135, name: '出羽桜' } }] })
    const tier1 = readsAs({ ...DASSAI_READ, brewery_printed: false })
    const tier2 = readsAs({ name_ja: '出羽桜', brewery_ja: '出羽桜酒造', brewery_printed: false, confidence: 0.85 })

    const { state, trace } = await scan(deps(tier1, tier2, catalogue))

    expect(state.status === 'matched' && state.brandId).toBe(135)
    expect(trace).toEqual({ tier1Status: 'matched_brewery_not_printed', tier2Used: true })
  })

  it('keeps a tier-1 match whose brewery is printed in the photo', async () => {
    const { trace } = await scan(deps(readsAs({ ...DASSAI_READ, brewery_printed: true }), neverAsked(), fakeCatalogue({ resolved: [EXACT_DASSAI] })))

    expect(trace.tier2Used).toBe(false)
  })

  it('reads the photo again with tier 2 when tier 1 alone throws', async () => {
    const { state, trace } = await scan(deps(throws(new Error('overloaded')), readsAs(DASSAI_READ), fakeCatalogue({ resolved: [EXACT_DASSAI] })))

    expect(state.status).toBe('matched')
    expect(trace).toEqual({ tier1Status: 'extraction_failed', tier2Used: true })
  })
})

// --- Photos that are not one bottle of sake ---------------------------------

describe('readLabel — photos that are not one bottle of sake', () => {
  it('says a bottle is shochu when its label prints that, and looks nothing up', async () => {
    // 濱田酒造 makes shochu and is in the catalogue for its sake; a lookup
    // would hand the visitor that sake.
    const shochu = readsAs({ subject: 'one_bottle', drink: 'shochu', name_ja: '赤兎馬', brewery_ja: '濱田酒造', confidence: 0.8 })
    const catalogue = fakeCatalogue()

    const { state, trace } = await scan(deps(shochu, shochu, catalogue))

    expect(state).toMatchObject({ status: 'not_sake', drink: 'shochu' })
    expect(trace).toEqual({ tier1Status: 'not_sake', tier2Used: true })
    expect(catalogue.resolve).not.toHaveBeenCalled()
  })

  it('looks a bottle up as before when the label does not say what the drink is', async () => {
    const { state } = await scan(deps(readsAs({ ...DASSAI_READ, drink: 'unknown' }), neverAsked(), fakeCatalogue({ resolved: [EXACT_DASSAI] })))

    expect(state.status).toBe('matched')
  })

  it('says a menu is a menu instead of naming one sake from it', async () => {
    const menu = readsAs({ ...DASSAI_READ, subject: 'menu' })
    const catalogue = fakeCatalogue()

    const { state } = await scan(deps(menu, menu, catalogue))

    expect(state).toMatchObject({ status: 'not_one_bottle', subject: 'menu' })
    expect(catalogue.resolve).not.toHaveBeenCalled()
  })

  it('takes tier 2’s word when tier 1 alone sees several bottles', async () => {
    const { state } = await scan(deps(
      readsAs({ ...DASSAI_READ, subject: 'several_bottles' }),
      readsAs({ ...DASSAI_READ, subject: 'one_bottle' }),
      fakeCatalogue({ resolved: [EXACT_DASSAI] }),
    ))

    expect(state.status).toBe('matched')
  })

  it('says so when several bottles share the photo', async () => {
    const several = readsAs({ ...DASSAI_READ, subject: 'several_bottles' })

    const { state } = await scan(deps(several, several, fakeCatalogue()))

    expect(state).toMatchObject({ status: 'not_one_bottle', subject: 'several_bottles' })
  })
})

// --- A second photo (#408) --------------------------------------------------

describe('readLabel — a second photo, with what the first one read (#408)', () => {
  it('reads a photo that follows an unsettled one with the stronger model at once', async () => {
    const tier2 = readsAs(DASSAI_READ)

    const { state, trace } = await scan(deps(neverAsked(), tier2, fakeCatalogue({ resolved: [EXACT_DASSAI] })), { earlierRead: EARLIER_READ })

    expect(state.status).toBe('matched')
    expect(trace).toEqual({ tier1Status: 'skipped_second_photo', tier2Used: true, earlierRead: 'not_needed' })
  })

  it('puts the sake both photos point at beside the outcome, which stays what it was', async () => {
    const catalogue = fakeCatalogue({ resolved: [NO_MATCH], withEarlierRead: vi.fn(async () => ({ sake: DASSAI })) })

    const { state, trace } = await scan(deps(neverAsked(), readsAs(DASSAI_READ), catalogue), { earlierRead: EARLIER_READ })

    expect(state.status).toBe('no_match')
    expect(state.status === 'no_match' && state.bothPhotos).toEqual({
      brandId: 100,
      sakeHref: '/en/sake/100?from=scan',
      nameKanji: '獺祭',
      nameRomaji: 'Dassai',
      breweryKanji: '旭酒造',
      breweryRomaji: 'Asahi Shuzo',
      prefectureName: 'Yamaguchi',
    })
    expect(catalogue.withEarlierRead).toHaveBeenCalledWith(
      expect.objectContaining({ name_ja: '獺祭' }),
      NO_MATCH,
      EARLIER_READ,
    )
    expect(trace.earlierRead).toBe('guess')
  })

  it('records that the two photos gave no guess together', async () => {
    const { state, trace } = await scan(deps(neverAsked(), readsAs(DASSAI_READ), fakeCatalogue({ resolved: [NO_MATCH] })), { earlierRead: EARLIER_READ })

    expect(state.status === 'no_match' && state.bothPhotos).toBeUndefined()
    expect(trace.earlierRead).toBe('no_guess')
  })

  it('does not consult the earlier read when this photo gives one sake', async () => {
    const catalogue = fakeCatalogue({ resolved: [EXACT_DASSAI] })

    await scan(deps(neverAsked(), readsAs(DASSAI_READ), catalogue), { earlierRead: EARLIER_READ })

    expect(catalogue.withEarlierRead).not.toHaveBeenCalled()
  })

  it('is an ordinary scan when no earlier read came with it', async () => {
    const catalogue = fakeCatalogue({ resolved: [NO_MATCH] })

    const { trace } = await scan(deps(readsAs(DASSAI_READ), readsAs(DASSAI_READ), catalogue))

    expect(catalogue.withEarlierRead).not.toHaveBeenCalled()
    expect(trace).not.toHaveProperty('earlierRead')
  })

  it('keeps the scan when combining the two reads fails', async () => {
    const catalogue = fakeCatalogue({ resolved: [NO_MATCH], withEarlierRead: vi.fn(async () => Promise.reject(new Error('connection reset'))) })

    const { state } = await scan(deps(neverAsked(), readsAs(DASSAI_READ), catalogue), { earlierRead: EARLIER_READ })

    expect(state.status).toBe('no_match')
    expect(state.status === 'no_match' && state.bothPhotos).toBeUndefined()
  })

  it('never sends the earlier read to the vision model', async () => {
    const model = mockModelReturning({ source: 'llm_extracted', ...DASSAI_READ })
    const provider = createAnthropicHaikuProvider({ model, nodeEnv: 'test' })

    await scan(deps(neverAsked(), provider, fakeCatalogue({ resolved: [NO_MATCH] })), { earlierRead: EARLIER_READ })

    expect(model.doGenerateCalls.length).toBeGreaterThan(0)
    expect(JSON.stringify(model.doGenerateCalls.map((call) => call.prompt))).not.toContain('人気一')
  })
})

// --- A real provider wrapper over a mock model -------------------------------

type DoGenerateFn = MockLanguageModelV3['doGenerate']
type DoGenerateResult = Awaited<ReturnType<DoGenerateFn>>

function mockModelReturning(extraction: unknown): MockLanguageModelV3 {
  const doGenerate: DoGenerateFn = async (): Promise<DoGenerateResult> => ({
    content: [{ type: 'text', text: JSON.stringify(extraction) }],
    finishReason: { unified: 'stop', raw: undefined },
    usage: {
      inputTokens: { total: undefined, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: undefined, text: undefined, reasoning: undefined },
    } as DoGenerateResult['usage'],
    warnings: [],
  })
  return new MockLanguageModelV3({ doGenerate })
}
