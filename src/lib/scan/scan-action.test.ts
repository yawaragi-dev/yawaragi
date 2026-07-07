import { afterEach, describe, expect, it, vi } from 'vitest'
import { MockLanguageModelV3 } from 'ai/test'

// The scan surface's end-to-end tier-1/tier-2 tool-loop and the full
// Sakenowa-lookup chain are exercised on preview via the Playwright
// E2E spec (`e2e/scan.spec.ts` with `VISION_PROVIDER=e2e-stub`). This
// file locks down the SERVER-SIDE action-boundary contract that Vitest
// can observe cheaply:
//
//   - input validation short-circuits before I/O (mirrors suggest-action.test.ts)
//   - session_missing when the anonymous-session cookie is absent
//   - each `scan-action-state.ts` variant returned by the extract-and-lookup
//     pipeline (no_match / low_confidence / extraction_failed / ambiguous /
//     matched_brand_only / matched_brewery_only / matched)
//   - the two-tier Haiku → Sonnet retry short-circuit fires on every
//     retryable tier-1 status but NOT on a clean tier-1 matched
//   - the RATE_LIMIT_BYPASS=1 escape hatch (round 6a of #161)
//
// Same shape as the sibling `src/lib/suggest/suggest-action.test.ts`.
// Sakenowa-lookup exports are mocked at the module boundary — the same
// vi.mock pattern suggest-action.test.ts uses for `@/lib/ai/mcp/registry`,
// applied to the module scan-action.ts imports lookup helpers from.

// `next/headers` is stubbed so any test that doesn't set cookies() /
// headers() behaviour fails loudly when the branch under test tries to
// reach for them (a positive proof that the input-validation branches
// short-circuit BEFORE I/O).
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
  headers: vi.fn(),
}))

// The transitive `@/i18n/navigation → next-intl/navigation → next/navigation`
// resolution is handled at the config layer (`vitest.config.mts` has
// `test.server.deps.inline: ['next-intl']`, see `docs/agents/vitest-mocks.md`).
// The local mock here exists to CONTROL the return value: tests assert on
// per-branch `sakeHref` shapes, so `getPathname` is stubbed to compute a
// deterministic URL from the brandId rather than routing through the real
// next-intl formatter.
vi.mock('@/i18n/navigation', () => ({
  getPathname: vi.fn(
    (arg: { locale: string; href: { pathname: string; params: { brandId: string } } }) =>
      `/${arg.locale}/sake/${arg.href.params.brandId}`,
  ),
}))

// The registry is mocked so tests can inject a `MockLanguageModelV3`
// per tier without hitting the real Anthropic factory (which pulls
// `ANTHROPIC_API_KEY` at first use).
vi.mock('@/lib/ai/vision/registry', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/ai/vision/registry')
  >('@/lib/ai/vision/registry')
  return {
    ...actual,
    getVisionProvider: vi.fn(),
  }
})

// Lookup helpers are the Sakenowa-side seam. Mocking at the module
// boundary (the imports scan-action.ts reads) is the same pattern
// suggest-action.test.ts uses to isolate the action from its MCP
// factory. The real lookup code has its own `lookup.integration.test.ts`
// against testcontainers — this file exercises the action's branching
// on the tagged-union result shape.
vi.mock('@/lib/sakenowa/lookup', () => ({
  findSakeByExtraction: vi.fn(),
  findSakeByBrandOnly: vi.fn(),
  findSakeByBreweryOnly: vi.fn(),
  lookupBreweryByBrand: vi.fn(),
  // #183 added `lookupFlavorChart` to the matched branch (ADR-0015 —
  // in-place result card fetches the chart alongside the brewery
  // romaji). Without this export in the mock factory the import
  // resolves to undefined and the matched branch throws
  // `TypeError: lookupFlavorChart is not a function`, which
  // scan-action's try/catch surfaces as `extraction_failed`. Bare
  // `vi.fn()` returns undefined; `Promise.all` treats non-thenables
  // as immediately fulfilled so matched tests pass without asserting
  // on the (null) chart value.
  lookupFlavorChart: vi.fn(),
}))

vi.mock('@/lib/rate-limit/config-gate', () => ({
  // Return null by default so the action skips rate-limit enforcement
  // (as if env is unset in non-production). Individual tests override
  // this when they want the config path to run to completion.
  assertRateLimitConfig: vi.fn().mockReturnValue(null),
}))

import { cookies, headers } from 'next/headers'
import { getVisionProvider } from '@/lib/ai/vision/registry'
import { createAnthropicHaikuProvider } from '@/lib/ai/vision/anthropic-haiku-provider'
import {
  findSakeByBrandOnly,
  findSakeByBreweryOnly,
  findSakeByExtraction,
  lookupBreweryByBrand,
} from '@/lib/sakenowa/lookup'
import { assertRateLimitConfig } from '@/lib/rate-limit/config-gate'
import { scanAction } from './scan-action'
import { INITIAL_SCAN_ACTION_STATE } from './scan-action-state'
import type { Brand } from '@/lib/schemas/brand'
import type { Brewery } from '@/lib/schemas/brewery'

const cookiesMock = vi.mocked(cookies)
const headersMock = vi.mocked(headers)
const getVisionProviderMock = vi.mocked(getVisionProvider)
const findSakeByExtractionMock = vi.mocked(findSakeByExtraction)
const findSakeByBrandOnlyMock = vi.mocked(findSakeByBrandOnly)
const findSakeByBreweryOnlyMock = vi.mocked(findSakeByBreweryOnly)
const lookupBreweryByBrandMock = vi.mocked(lookupBreweryByBrand)
const assertRateLimitConfigMock = vi.mocked(assertRateLimitConfig)

// --- Fixtures ---------------------------------------------------------

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

const KIKU_BRAND: Brand = {
  brandId: 300,
  name: 'Kiku-Masamune',
  nameKanji: '菊正宗',
  nameRomaji: 'Kiku-Masamune',
  breweryId: 70,
  source: 'sakenowa',
}

const KIKU_BREWERY: Brewery = {
  breweryId: 70,
  name: 'Kiku-Masamune Sake Brewing',
  nameKanji: '菊正宗酒造',
  nameRomaji: 'Kiku-Masamune Sake Brewing',
  areaId: 27,
  source: 'sakenowa',
}

// --- Helpers ----------------------------------------------------------

/**
 * Wire an empty cookie jar + empty headers. Used by tests that care
 * about a downstream branch and don't touch the rate-limit-config path
 * (assertRateLimitConfig returns null by default). Cookie shape is the
 * minimal `get(name)` surface the action reads.
 */
function stubEmptyRequestContext() {
  cookiesMock.mockResolvedValue({
    get: () => undefined,
  } as unknown as Awaited<ReturnType<typeof cookies>>)
  headersMock.mockResolvedValue({
    get: () => null,
  } as unknown as Awaited<ReturnType<typeof headers>>)
}

/**
 * `getVisionProvider` in scan-action.ts is called with the tier's
 * registry key. This helper wires two calls: the first (`anthropic-haiku-4-5`)
 * returns the tier-1 provider, the second (`anthropic-sonnet-4-6`)
 * returns the tier-2 provider. When only one tier is passed the second
 * call rejects loudly — that's the assertion that tier-2 was NOT
 * needed (the tier-1 result short-circuits to `matched`).
 */
function stubVisionTiers(tier1: MockLanguageModelV3, tier2?: MockLanguageModelV3) {
  getVisionProviderMock.mockImplementation((key) => {
    if (key === 'anthropic-haiku-4-5') {
      return createAnthropicHaikuProvider({ model: tier1, nodeEnv: 'test' })
    }
    if (key === 'anthropic-sonnet-4-6') {
      if (!tier2) {
        // Fails loudly if the tier-2 branch was reached unexpectedly.
        return {
          extractLabel: () =>
            Promise.reject(
              new Error('tier-2 provider requested but no tier-2 mock was provided'),
            ),
        }
      }
      return createAnthropicHaikuProvider({ model: tier2, nodeEnv: 'test' })
    }
    throw new Error(`unexpected vision provider key: ${key}`)
  })
}

// Type-inferred call-option and result shapes from the mock class, so
// we don't take a direct dep on `@ai-sdk/provider`. Same trick as the
// sibling `anthropic-haiku-provider.test.ts`.
type DoGenerateFn = MockLanguageModelV3['doGenerate']
type DoGenerateResult = Awaited<ReturnType<DoGenerateFn>>

async function doGenerateOk(): Promise<DoGenerateResult> {
  return {
    content: [{ type: 'text', text: '' }],
    finishReason: { unified: 'stop', raw: undefined },
    usage: {
      inputTokens: {
        total: undefined,
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: { total: undefined, text: undefined, reasoning: undefined },
    } as DoGenerateResult['usage'],
    warnings: [],
  }
}

/**
 * Build a `MockLanguageModelV3` whose `doGenerate` returns the JSON-
 * stringified extraction object. `generateObject` reads the first text
 * part, JSON-parses it, and validates against `LabelScanExtractionSchema`.
 */
function mockModelReturning(extraction: unknown): MockLanguageModelV3 {
  const doGenerate: DoGenerateFn = async (): Promise<DoGenerateResult> => ({
    ...(await doGenerateOk()),
    content: [{ type: 'text', text: JSON.stringify(extraction) }],
  })
  return new MockLanguageModelV3({ doGenerate })
}

/**
 * Build a `MockLanguageModelV3` whose `doGenerate` throws. Used to
 * force the action's try/catch → `extraction_failed` branch.
 */
function mockModelThrowing(err: Error): MockLanguageModelV3 {
  const doGenerate: DoGenerateFn = async (): Promise<DoGenerateResult> => {
    throw err
  }
  return new MockLanguageModelV3({ doGenerate })
}

function jpegFormData(locale = 'en'): FormData {
  const fd = new FormData()
  fd.set('image', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }))
  fd.set('locale', locale)
  return fd
}

const DASSAI_EXTRACTION = {
  source: 'llm_extracted',
  name_ja: '獺祭',
  brewery_ja: '旭酒造',
  confidence: 0.95,
}

const RETRY_TIER_EXTRACTION = {
  source: 'llm_extracted',
  name_ja: '獺祭',
  brewery_ja: '旭酒造',
  confidence: 0.4,
}

// --- Input validation ------------------------------------------------

describe('scanAction — input validation', () => {
  it('rejects a submission with no image blob before hitting any downstream I/O', async () => {
    // If cookies() is reached the mock crashes — that's the loud
    // failure we want. The invalid_input check must fire first.
    cookiesMock.mockResolvedValue({
      get: () => undefined,
    } as unknown as Awaited<ReturnType<typeof cookies>>)

    const fd = new FormData()
    fd.set('locale', 'en')
    const state = await scanAction(INITIAL_SCAN_ACTION_STATE, fd)

    expect(state.status).toBe('invalid_input')
    if (state.status === 'invalid_input') {
      expect(state.reason).toBe('missing_image')
    }
    // The rate-limit path is never entered when the image is missing.
    expect(assertRateLimitConfigMock).not.toHaveBeenCalled()
    expect(getVisionProviderMock).not.toHaveBeenCalled()
  })

  it('rejects a submission with an empty (zero-byte) image blob', async () => {
    cookiesMock.mockResolvedValue({
      get: () => undefined,
    } as unknown as Awaited<ReturnType<typeof cookies>>)

    const fd = new FormData()
    fd.set('image', new Blob([], { type: 'image/jpeg' }))
    fd.set('locale', 'en')
    const state = await scanAction(INITIAL_SCAN_ACTION_STATE, fd)

    expect(state.status).toBe('invalid_input')
    if (state.status === 'invalid_input') {
      expect(state.reason).toBe('missing_image')
    }
    expect(getVisionProviderMock).not.toHaveBeenCalled()
  })

  it('rejects a submission whose locale is not a configured routing locale', async () => {
    cookiesMock.mockResolvedValue({
      get: () => undefined,
    } as unknown as Awaited<ReturnType<typeof cookies>>)

    const fd = new FormData()
    fd.set('image', new Blob([new Uint8Array([1])], { type: 'image/jpeg' }))
    // The routing manifest declares ['en', 'de']; a stale client build
    // could POST a locale from a since-removed manifest entry.
    fd.set('locale', 'fr')
    const state = await scanAction(INITIAL_SCAN_ACTION_STATE, fd)

    expect(state.status).toBe('invalid_input')
    if (state.status === 'invalid_input') {
      expect(state.reason).toBe('unsupported_locale')
    }
    expect(getVisionProviderMock).not.toHaveBeenCalled()
  })

  it('rejects a submission whose locale form field is missing entirely', async () => {
    // Not the same as an unsupported locale — the client failed to
    // include the field at all. The action must treat this as
    // unsupported_locale (the tagged-state grammar has no
    // "missing_locale" variant, so the two collapse into one).
    cookiesMock.mockResolvedValue({
      get: () => undefined,
    } as unknown as Awaited<ReturnType<typeof cookies>>)

    const fd = new FormData()
    fd.set('image', new Blob([new Uint8Array([1])], { type: 'image/jpeg' }))
    const state = await scanAction(INITIAL_SCAN_ACTION_STATE, fd)

    expect(state.status).toBe('invalid_input')
    if (state.status === 'invalid_input') {
      expect(state.reason).toBe('unsupported_locale')
    }
  })
})

// --- session_missing (post-#161 middleware refactor) ------------------

describe('scanAction — session_missing (post-#161 middleware refactor)', () => {
  afterEach(() => {
    assertRateLimitConfigMock.mockReturnValue(null)
  })

  it('returns session_missing when the anonymous-session cookie is absent and rate-limit env is fully configured', async () => {
    // Simulate a fully-configured rate-limit env — the config-gate
    // returns a real config bundle. The action then tries to read the
    // cookie and hits the empty jar; the read-only refactor surfaces
    // that as a typed state instead of throwing or writing a fresh
    // cookie.
    assertRateLimitConfigMock.mockReturnValueOnce({
      secret: 'test-secret-32-characters-minimum',
      salt: 'test-salt-16chars',
      kvUrl: 'https://kv.example.test',
      kvToken: 'test-token',
    })
    cookiesMock.mockResolvedValue({
      get: () => undefined,
    } as unknown as Awaited<ReturnType<typeof cookies>>)
    headersMock.mockResolvedValue({
      get: () => null,
    } as unknown as Awaited<ReturnType<typeof headers>>)

    const state = await scanAction(INITIAL_SCAN_ACTION_STATE, jpegFormData())

    expect(state.status).toBe('session_missing')
    // The vision provider is never reached — session_missing
    // short-circuits before the two-tier extraction pipeline.
    expect(getVisionProviderMock).not.toHaveBeenCalled()
  })
})

// --- Vision-tier states (retry) --------------------------------------

describe('scanAction — vision-tier states', () => {
  afterEach(() => {
    vi.clearAllMocks()
    assertRateLimitConfigMock.mockReturnValue(null)
  })

  it('returns low_confidence when the extraction confidence is below the retry threshold', async () => {
    // Below 0.60 the action short-circuits BEFORE running the Sakenowa
    // lookup. Tier-2 still runs (per the two-tier retry rules), so we
    // wire tier-2 to return the same low-confidence extraction.
    stubEmptyRequestContext()
    stubVisionTiers(
      mockModelReturning(RETRY_TIER_EXTRACTION),
      mockModelReturning(RETRY_TIER_EXTRACTION),
    )

    const state = await scanAction(INITIAL_SCAN_ACTION_STATE, jpegFormData())

    expect(state.status).toBe('low_confidence')
    // Retry tier short-circuits before Sakenowa; if the lookup was hit
    // this test would surface the "no_match" state instead.
    expect(findSakeByExtractionMock).not.toHaveBeenCalled()
  })

  it('routes to low_confidence when the model emits a "不明" placeholder even at high confidence', async () => {
    // The system prompt forbids sentinel values but the model
    // occasionally still emits them. The hard-coded routing to
    // low_confidence ignores confidence entirely so a placeholder at
    // 0.85 does not feed Sakenowa a query that can never match.
    stubEmptyRequestContext()
    const placeholder = {
      source: 'llm_extracted',
      name_ja: '不明',
      brewery_ja: '旭酒造',
      confidence: 0.9,
    }
    stubVisionTiers(mockModelReturning(placeholder), mockModelReturning(placeholder))

    const state = await scanAction(INITIAL_SCAN_ACTION_STATE, jpegFormData())

    expect(state.status).toBe('low_confidence')
    expect(findSakeByExtractionMock).not.toHaveBeenCalled()
  })

  it('routes to low_confidence when brewery_ja is Latin-only (script guard fires)', async () => {
    // Latin brewery names are the model misreading a rice-variety
    // call-out, retailer name, or similar — never a real brewery in
    // Sakenowa. Guard fires regardless of confidence.
    stubEmptyRequestContext()
    const latinBrewery = {
      source: 'llm_extracted',
      name_ja: '獺祭',
      brewery_ja: 'YAMADA NISHIKI',
      confidence: 0.9,
    }
    stubVisionTiers(
      mockModelReturning(latinBrewery),
      mockModelReturning(latinBrewery),
    )

    const state = await scanAction(INITIAL_SCAN_ACTION_STATE, jpegFormData())

    expect(state.status).toBe('low_confidence')
    expect(findSakeByExtractionMock).not.toHaveBeenCalled()
  })

  it('returns extraction_failed when both tiers throw', async () => {
    stubEmptyRequestContext()
    stubVisionTiers(
      mockModelThrowing(new Error('anthropic 5xx')),
      mockModelThrowing(new Error('anthropic 5xx')),
    )

    const state = await scanAction(INITIAL_SCAN_ACTION_STATE, jpegFormData())

    expect(state.status).toBe('extraction_failed')
    if (state.status === 'extraction_failed') {
      // `reason` carries the error name, not the message. The UI
      // uses generic localized copy — the full message is scoped to
      // the debug log.
      expect(state.reason).toBe('Error')
    }
    expect(findSakeByExtractionMock).not.toHaveBeenCalled()
  })
})

// --- Sakenowa-lookup states ------------------------------------------

describe('scanAction — Sakenowa lookup states', () => {
  afterEach(() => {
    vi.clearAllMocks()
    assertRateLimitConfigMock.mockReturnValue(null)
  })

  it('returns matched with the brand href when the first-pass lookup returns a single exact row', async () => {
    stubEmptyRequestContext()
    stubVisionTiers(mockModelReturning(DASSAI_EXTRACTION))

    findSakeByExtractionMock.mockResolvedValueOnce({
      kind: 'exact',
      sake: DASSAI_BRAND,
    })
    lookupBreweryByBrandMock.mockResolvedValueOnce(ASAHI_SHUZO)

    const state = await scanAction(INITIAL_SCAN_ACTION_STATE, jpegFormData())

    expect(state.status).toBe('matched')
    if (state.status === 'matched') {
      expect(state.brandId).toBe(DASSAI_BRAND.brandId)
      expect(state.sakeHref).toBe(`/en/sake/${DASSAI_BRAND.brandId}`)
      expect(state.sakeRomaji).toBe('Dassai')
      expect(state.breweryRomaji).toBe('Asahi Shuzo')
    }
    // Tier-1 matched → tier-2 provider is never constructed.
    expect(getVisionProviderMock).toHaveBeenCalledTimes(1)
    expect(getVisionProviderMock).toHaveBeenCalledWith('anthropic-haiku-4-5')
  })

  it('returns no_match when both tiers extract cleanly but Sakenowa has no such brand', async () => {
    stubEmptyRequestContext()
    stubVisionTiers(
      mockModelReturning(DASSAI_EXTRACTION),
      mockModelReturning(DASSAI_EXTRACTION),
    )

    findSakeByExtractionMock.mockResolvedValue({
      kind: 'no_match',
      query: { nameJa: '獺祭', breweryJa: '旭酒造' },
    })

    const state = await scanAction(INITIAL_SCAN_ACTION_STATE, jpegFormData())

    expect(state.status).toBe('no_match')
    // The two-tier retry rules retry every non-matched tier-1 outcome
    // — so both tiers ran (tier-1 no_match → tier-2 no_match).
    expect(getVisionProviderMock).toHaveBeenCalledWith('anthropic-haiku-4-5')
    expect(getVisionProviderMock).toHaveBeenCalledWith('anthropic-sonnet-4-6')
    expect(findSakeByExtractionMock).toHaveBeenCalledTimes(2)
  })

  it('returns matched_brand_only with brewery divergence when only the brand-only fallback resolves on tier-2', async () => {
    stubEmptyRequestContext()
    stubVisionTiers(
      mockModelReturning(DASSAI_EXTRACTION),
      mockModelReturning(DASSAI_EXTRACTION),
    )

    // Tier-1 result → matched_brand_only → triggers retry to tier-2
    // (per the two-tier retry rules). Tier-2 lands on the same
    // matched_brand_only shape which the action returns as-is.
    findSakeByExtractionMock.mockResolvedValue({
      kind: 'matched_brand_only',
      sake: DASSAI_BRAND,
      brewery: ASAHI_SHUZO,
      breweryDivergence: { extracted: '別の蔵', stored: '旭酒造' },
      query: { nameJa: '獺祭', breweryJa: '別の蔵' },
    })

    const state = await scanAction(INITIAL_SCAN_ACTION_STATE, jpegFormData())

    expect(state.status).toBe('matched_brand_only')
    if (state.status === 'matched_brand_only') {
      expect(state.brandId).toBe(DASSAI_BRAND.brandId)
      expect(state.sakeHref).toBe(`/en/sake/${DASSAI_BRAND.brandId}`)
      expect(state.breweryDivergence.extracted).toBe('別の蔵')
      expect(state.breweryDivergence.stored).toBe('旭酒造')
      expect(state.breweryDivergence.storedRomaji).toBe('Asahi Shuzo')
      expect(state.sakeKanji).toBe('獺祭')
      expect(state.sakeRomaji).toBe('Dassai')
    }
    // Retry logic ran (tier-1 matched_brand_only → tier-2).
    expect(getVisionProviderMock).toHaveBeenCalledWith('anthropic-sonnet-4-6')
  })

  it('returns matched_brewery_only with brand divergence when only the brewery-only fallback resolves', async () => {
    stubEmptyRequestContext()
    stubVisionTiers(
      mockModelReturning({
        source: 'llm_extracted',
        name_ja: '寺田',
        brewery_ja: '高清水酒造',
        confidence: 0.9,
      }),
      mockModelReturning({
        source: 'llm_extracted',
        name_ja: '寺田',
        brewery_ja: '高清水酒造',
        confidence: 0.9,
      }),
    )

    findSakeByExtractionMock.mockResolvedValue({
      kind: 'matched_brewery_only',
      sake: TAKASHIMIZU_BRAND,
      brewery: TAKASHIMIZU_BREWERY,
      brandDivergence: { extracted: '寺田', stored: '高清水' },
      query: { nameJa: '寺田', breweryJa: '高清水酒造' },
    })

    const state = await scanAction(INITIAL_SCAN_ACTION_STATE, jpegFormData())

    expect(state.status).toBe('matched_brewery_only')
    if (state.status === 'matched_brewery_only') {
      expect(state.brandId).toBe(TAKASHIMIZU_BRAND.brandId)
      expect(state.brandDivergence.extracted).toBe('寺田')
      expect(state.brandDivergence.stored).toBe('高清水')
      expect(state.brandDivergence.storedRomaji).toBe('Takashimizu')
      expect(state.breweryRomaji).toBe('Akita Shurui Seizo')
    }
  })

  it('returns ambiguous with locale-aware sakeHref per candidate when multiple brands match', async () => {
    // A German visitor: locale='de' so the candidate hrefs should be
    // prefixed with /de/.
    stubEmptyRequestContext()
    stubVisionTiers(
      mockModelReturning({
        source: 'llm_extracted',
        name_ja: '菊正宗',
        brewery_ja: '菊正宗酒造',
        confidence: 0.9,
      }),
      mockModelReturning({
        source: 'llm_extracted',
        name_ja: '菊正宗',
        brewery_ja: '菊正宗酒造',
        confidence: 0.9,
      }),
    )
    findSakeByExtractionMock.mockResolvedValue({
      kind: 'ambiguous',
      candidates: [
        { sake: DASSAI_BRAND, brewery: ASAHI_SHUZO },
        { sake: KIKU_BRAND, brewery: KIKU_BREWERY },
      ],
      query: { nameJa: '菊正宗', breweryJa: '菊正宗酒造' },
    })

    const state = await scanAction(INITIAL_SCAN_ACTION_STATE, jpegFormData('de'))

    expect(state.status).toBe('ambiguous')
    if (state.status === 'ambiguous') {
      expect(state.candidates).toHaveLength(2)
      // Locale routing: German visitor gets /de/-prefixed hrefs on
      // every candidate row.
      expect(state.candidates[0].sakeHref).toBe(`/de/sake/${DASSAI_BRAND.brandId}`)
      expect(state.candidates[1].sakeHref).toBe(`/de/sake/${KIKU_BRAND.brandId}`)
      expect(state.candidates[0].nameKanji).toBe('獺祭')
      expect(state.candidates[1].breweryKanji).toBe('菊正宗酒造')
      // #109 PR B: each candidate carries its brewery's prefecture name
      // (editorial Hepburn form from the static area map) so the
      // disambiguation list can show "永井酒造 (Nagai Shuzo, Gunma)".
      // Asahi Shuzo → areaId 35 → Yamaguchi; Kiku-Masamune → areaId 27
      // → Osaka. Derived from `getPrefectureNames(brewery.areaId)`; no
      // new query.
      expect(state.candidates[0].prefectureName).toBe('Yamaguchi')
      expect(state.candidates[1].prefectureName).toBe('Osaka')
    }
  })
})

// --- Single-char guard + brewery-only rescue -------------------------

describe('scanAction — single-char hallucination guard', () => {
  afterEach(() => {
    vi.clearAllMocks()
    assertRateLimitConfigMock.mockReturnValue(null)
  })

  it('rescues a single-char brand hallucination via brewery-only fallback', async () => {
    // Model returns "寺田" (single character in the sense of Array.from
    // length=1 for surrogate handling — here we use a genuinely 1-char
    // brand hallucination). The single-char guard triggers the
    // brewery-only fallback before falling back to low_confidence.
    stubEmptyRequestContext()
    const oneCharExtraction = {
      source: 'llm_extracted',
      name_ja: '梗',
      brewery_ja: '高清水酒造',
      confidence: 0.75,
    }
    stubVisionTiers(
      mockModelReturning(oneCharExtraction),
      mockModelReturning(oneCharExtraction),
    )

    findSakeByBreweryOnlyMock.mockResolvedValue({
      kind: 'matched_brewery_only',
      sake: TAKASHIMIZU_BRAND,
      brewery: TAKASHIMIZU_BREWERY,
      brandDivergence: { extracted: '梗', stored: '高清水' },
      query: { nameJa: '梗', breweryJa: '高清水酒造' },
    })

    const state = await scanAction(INITIAL_SCAN_ACTION_STATE, jpegFormData())

    expect(state.status).toBe('matched_brewery_only')
    if (state.status === 'matched_brewery_only') {
      expect(state.brandId).toBe(TAKASHIMIZU_BRAND.brandId)
      expect(state.brandDivergence.extracted).toBe('梗')
      expect(state.brandDivergence.stored).toBe('高清水')
    }
    // The guard short-circuits BEFORE findSakeByExtraction — only the
    // brewery-only fallback runs.
    expect(findSakeByExtractionMock).not.toHaveBeenCalled()
    expect(findSakeByBreweryOnlyMock).toHaveBeenCalled()
  })

  it('rescues a single-char + wrong brewery via field-swap brand-only lookup', async () => {
    // Model produced 1-char name + brewery field that's actually a
    // brand kanji (field-swap case). Brewery-only misses; field-swap
    // brand-only lookup hits. Landing state is matched_brand_only.
    stubEmptyRequestContext()
    const swapExtraction = {
      source: 'llm_extracted',
      name_ja: '梗',
      brewery_ja: '獺祭',
      confidence: 0.75,
    }
    stubVisionTiers(
      mockModelReturning(swapExtraction),
      mockModelReturning(swapExtraction),
    )

    findSakeByBreweryOnlyMock.mockResolvedValue({
      kind: 'no_match',
      query: { nameJa: '梗', breweryJa: '獺祭' },
    })
    findSakeByBrandOnlyMock.mockResolvedValue({
      kind: 'matched_brand_only',
      sake: DASSAI_BRAND,
      brewery: ASAHI_SHUZO,
      breweryDivergence: { extracted: '獺祭', stored: '旭酒造' },
      query: { nameJa: '獺祭', breweryJa: '獺祭' },
    })

    const state = await scanAction(INITIAL_SCAN_ACTION_STATE, jpegFormData())

    expect(state.status).toBe('matched_brand_only')
    if (state.status === 'matched_brand_only') {
      expect(state.brandId).toBe(DASSAI_BRAND.brandId)
      // Field-swap path: sakeKanji falls back to the canonical form
      // because the extraction's name_ja is the hallucinated single
      // character, not a variant of the catalogue brand.
      expect(state.sakeKanji).toBe('獺祭')
      expect(state.breweryDivergence.stored).toBe('旭酒造')
    }
    expect(findSakeByBreweryOnlyMock).toHaveBeenCalled()
    expect(findSakeByBrandOnlyMock).toHaveBeenCalled()
    expect(findSakeByExtractionMock).not.toHaveBeenCalled()
  })

  it('falls through to low_confidence when the single-char guard fires and both rescues miss', async () => {
    stubEmptyRequestContext()
    const guardExtraction = {
      source: 'llm_extracted',
      name_ja: '梗',
      brewery_ja: '存在しない',
      confidence: 0.7,
    }
    stubVisionTiers(
      mockModelReturning(guardExtraction),
      mockModelReturning(guardExtraction),
    )
    findSakeByBreweryOnlyMock.mockResolvedValue({
      kind: 'no_match',
      query: { nameJa: '梗', breweryJa: '存在しない' },
    })
    findSakeByBrandOnlyMock.mockResolvedValue({
      kind: 'no_match',
      query: { nameJa: '存在しない', breweryJa: '存在しない' },
    })

    const state = await scanAction(INITIAL_SCAN_ACTION_STATE, jpegFormData())

    expect(state.status).toBe('low_confidence')
    // The main-path Sakenowa lookup is never reached — the guard's
    // fallback chain owns the outcome.
    expect(findSakeByExtractionMock).not.toHaveBeenCalled()
  })
})

// --- Two-tier retry --------------------------------------------------

describe('scanAction — two-tier Haiku → Sonnet retry', () => {
  afterEach(() => {
    vi.clearAllMocks()
    assertRateLimitConfigMock.mockReturnValue(null)
  })

  it('promotes a tier-2 matched when tier-1 returned no_match', async () => {
    // Tier-1 (Haiku) extracts but no Sakenowa match; tier-2 (Sonnet)
    // reads the label more accurately and gets an exact match. The
    // final state carries the tier-2 outcome.
    stubEmptyRequestContext()

    stubVisionTiers(
      // Tier-1: misreads the brand; Sakenowa lookup returns no_match.
      mockModelReturning({
        source: 'llm_extracted',
        name_ja: '獺祭偽',
        brewery_ja: '旭酒造',
        confidence: 0.9,
      }),
      // Tier-2: reads it correctly.
      mockModelReturning(DASSAI_EXTRACTION),
    )

    findSakeByExtractionMock
      .mockResolvedValueOnce({
        kind: 'no_match',
        query: { nameJa: '獺祭偽', breweryJa: '旭酒造' },
      })
      .mockResolvedValueOnce({
        kind: 'exact',
        sake: DASSAI_BRAND,
      })
    lookupBreweryByBrandMock.mockResolvedValueOnce(ASAHI_SHUZO)

    const state = await scanAction(INITIAL_SCAN_ACTION_STATE, jpegFormData())

    expect(state.status).toBe('matched')
    if (state.status === 'matched') {
      expect(state.brandId).toBe(DASSAI_BRAND.brandId)
      expect(state.breweryRomaji).toBe('Asahi Shuzo')
    }
    // Both tiers were constructed.
    expect(getVisionProviderMock).toHaveBeenCalledWith('anthropic-haiku-4-5')
    expect(getVisionProviderMock).toHaveBeenCalledWith('anthropic-sonnet-4-6')
  })

  it('does NOT retry with tier-2 when tier-1 returns a clean matched (cost-protection invariant)', async () => {
    // The only tier-1 outcome the action KEEPS as-is is a first-pass
    // matched. Any retry here would burn Sonnet credit for no UX gain.
    // stubVisionTiers() with only a tier-1 model wires the tier-2
    // provider to reject loudly — this test proves that rejection is
    // never observed because tier-2 is never requested.
    stubEmptyRequestContext()
    stubVisionTiers(mockModelReturning(DASSAI_EXTRACTION))

    findSakeByExtractionMock.mockResolvedValueOnce({
      kind: 'exact',
      sake: DASSAI_BRAND,
    })
    lookupBreweryByBrandMock.mockResolvedValueOnce(ASAHI_SHUZO)

    const state = await scanAction(INITIAL_SCAN_ACTION_STATE, jpegFormData())

    expect(state.status).toBe('matched')
    // ONLY the Haiku key was requested. If a refactor swapped in a
    // stricter tier-1 → always-retry rule, this call count would fail.
    expect(getVisionProviderMock).toHaveBeenCalledTimes(1)
    expect(getVisionProviderMock).toHaveBeenCalledWith('anthropic-haiku-4-5')
  })
})

// --- RATE_LIMIT_BYPASS escape hatch (from round 6a of #161) ----------

describe('scanAction — RATE_LIMIT_BYPASS escape hatch', () => {
  // The bypass is a top-of-function short-circuit inside `enforceRateLimit`
  // (see scan-action.ts § "Dev/preview escape hatch"). It's covered at
  // the env-parse and prod-guard layers by config-gate.test.ts, but the
  // action-boundary behaviour — that the bypass fires BEFORE
  // assertRateLimitConfig / the cookie read / the KV round-trip — is
  // only observable here. Regression insurance for the "someone
  // refactors enforceRateLimit and moves the guard below the config
  // gate" future.
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('short-circuits enforceRateLimit before touching config-gate when RATE_LIMIT_BYPASS=1', async () => {
    // Env must be set BEFORE we resetModules + dynamic-import, because
    // `env` is parsed at module load in src/env.ts (Zod .parse on
    // process.env). Same stubEnv + reset + dynamic-import shape as
    // `src/lib/ai/mcp/registry.test.ts`'s missing-env-var test.
    vi.stubEnv('RATE_LIMIT_BYPASS', '1')
    vi.resetModules()

    const { scanAction: freshScanAction } = await import('./scan-action')
    const { INITIAL_SCAN_ACTION_STATE: freshInitialState } = await import(
      './scan-action-state'
    )
    const { getVisionProvider: freshGetVision } = await import(
      '@/lib/ai/vision/registry'
    )
    const { assertRateLimitConfig: freshAssertConfig } = await import(
      '@/lib/rate-limit/config-gate'
    )
    const { cookies: freshCookies } = await import('next/headers')

    const freshGetVisionMock = vi.mocked(freshGetVision)
    const freshAssertConfigMock = vi.mocked(freshAssertConfig)
    const freshCookiesMock = vi.mocked(freshCookies)

    // Fresh call-history so `not.toHaveBeenCalled()` asserts THIS
    // test's behaviour, not accumulation across the file's module
    // lifetime.
    freshAssertConfigMock.mockClear()

    // Cookie jar reachable for the up-front debug-cookie read. No
    // debug cookie set — the DebugLog stays undefined and every
    // downstream `debugAdd` is a no-op.
    freshCookiesMock.mockResolvedValue({
      get: () => undefined,
    } as unknown as Awaited<ReturnType<typeof cookies>>)

    // Reach through the bypass to the vision provider → throw there.
    // That the code reaches extractLabel is the PROOF the bypass fired:
    // if it hadn't, the action would return `session_missing` (since
    // assertRateLimitConfig returns null and the cookie is empty) or
    // `rate_limited`, never touching the vision provider.
    freshGetVisionMock.mockReturnValue({
      extractLabel: vi
        .fn()
        .mockRejectedValue(new Error('bypass-fired — vision provider reached')),
    })

    // Swallow + assert the warn — the guard emits `console.warn` on
    // every bypass firing so an operator tailing logs sees a clear
    // "you have an escape hatch active" line.
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    // Minimal FormData with a non-empty JPEG blob and a valid locale.
    // The blob just needs `size > 0` for the invalid_input check to
    // pass — the mocked extractLabel throws before the bytes matter.
    const formData = new FormData()
    formData.set('image', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }))
    formData.set('locale', 'en')

    const state = await freshScanAction(freshInitialState, formData)

    // extraction_failed proves the code reached the vision provider
    // (past the rate-limit gate). rate_limited or session_missing
    // would prove the bypass DIDN'T fire.
    expect(state.status).toBe('extraction_failed')
    // The bypass short-circuits BEFORE assertRateLimitConfig runs —
    // the whole point of the escape hatch is to skip the config check
    // entirely so dev iteration works without KV credentials.
    expect(freshAssertConfigMock).not.toHaveBeenCalled()
    // The warn line makes the escape hatch observable in local /
    // preview logs. `'[scan]'` prefix distinguishes it from the
    // sibling suggest-action's `'[suggest]'` warn.
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/RATE_LIMIT_BYPASS/))

    warnSpy.mockRestore()
  })
})
