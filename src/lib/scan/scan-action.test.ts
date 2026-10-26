import { afterEach, describe, expect, it, vi } from 'vitest'

// What the scan Server Action itself owns: parsing the form before any I/O,
// the rate-limit gate (and its RATE_LIMIT_BYPASS escape hatch), handing the
// photo to the label pipeline with the registry's two tiers, recording what
// the read cost on the Langfuse span, and adding the visitor's own bottlings
// to a match. Where a read lands — the two-tier rule, every result state,
// the guesses, the second photo — is `read-label.test.ts`, against fakes.
// The end-to-end flow runs in `e2e/scan-*.spec.ts` with VISION_PROVIDER=e2e-stub.

// The rate limit lets a signed-in maintainer through. These tests are about
// anonymous visitors, and Clerk's auth() has no request to read here.
vi.mock('@/lib/auth/maintainer', () => ({
  currentUserIsMaintainer: async () => false,
}))

// The visitor's journal, read only to list their own bottlings of a matched
// sake. Clerk and Upstash have nothing to answer with in a unit test.
const resolveViewerJournalMock = vi.fn(async () => ({
  canLog: false,
  entries: [],
  cellar: [],
  expressions: [] as { id: string; name: string; brandId: number | null }[],
}))
vi.mock('@/lib/taste/viewer-journal', () => ({
  resolveViewerJournal: () => resolveViewerJournalMock(),
}))

// Stubbed so a branch that should short-circuit before I/O fails loudly if
// it reaches for cookies() or headers().
vi.mock('next/headers', () => ({
  cookies: vi.fn(),
  headers: vi.fn(),
}))

// The registry builds Anthropic providers, which want a key; these tests hand
// the action plain fake providers per tier instead.
vi.mock('@/lib/ai/vision/registry', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai/vision/registry')>('@/lib/ai/vision/registry')
  return { ...actual, getVisionProvider: vi.fn() }
})

// The catalogue the action wires into the pipeline is Postgres.
vi.mock('@/lib/sakenowa/resolve-scanned-label', () => ({ resolveScannedLabel: vi.fn() }))
vi.mock('@/lib/sakenowa/catalogue-reads', () => ({
  lookupBreweryByBrand: vi.fn(),
  lookupFlavorChart: vi.fn(),
}))

// Spied on to see what the action records on its Langfuse span.
vi.mock('@/lib/ai/observability/action-span', async () => {
  const actual = await vi.importActual<typeof import('@/lib/ai/observability/action-span')>('@/lib/ai/observability/action-span')
  return { ...actual, recordActionMetadata: vi.fn() }
})

vi.mock('@/lib/rate-limit/config-gate', () => ({
  // Null by default: the action skips rate-limit enforcement, as with the
  // env unset outside production. A test overrides it to run the config path.
  assertRateLimitConfig: vi.fn().mockReturnValue(null),
}))

import { cookies, headers } from 'next/headers'
import { getVisionProvider } from '@/lib/ai/vision/registry'
import type { VisionProvider } from '@/lib/ai/vision/vision-provider'
import { recordActionMetadata } from '@/lib/ai/observability/action-span'
import { resolveScannedLabel } from '@/lib/sakenowa/resolve-scanned-label'
import { lookupBreweryByBrand } from '@/lib/sakenowa/catalogue-reads'
import { assertRateLimitConfig } from '@/lib/rate-limit/config-gate'
import { LabelScanExtractionSchema } from '@/lib/schemas/label-scan-extraction'
import { scanAction } from './scan-action'
import { INITIAL_SCAN_ACTION_STATE } from './scan-action-state'
import type { Brand } from '@/lib/schemas/brand'
import type { Brewery } from '@/lib/schemas/brewery'

const cookiesMock = vi.mocked(cookies)
const headersMock = vi.mocked(headers)
const getVisionProviderMock = vi.mocked(getVisionProvider)
const resolveScannedLabelMock = vi.mocked(resolveScannedLabel)
const lookupBreweryByBrandMock = vi.mocked(lookupBreweryByBrand)
const recordActionMetadataMock = vi.mocked(recordActionMetadata)
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

const DASSAI_EXTRACTION = {
  name_ja: '獺祭',
  brewery_ja: '旭酒造',
  confidence: 0.95,
}

// --- Helpers ----------------------------------------------------------

/** An empty cookie jar and empty headers: no debug cookie, no session. */
function stubEmptyRequestContext() {
  cookiesMock.mockResolvedValue({
    get: () => undefined,
  } as unknown as Awaited<ReturnType<typeof cookies>>)
  headersMock.mockResolvedValue({
    get: () => null,
  } as unknown as Awaited<ReturnType<typeof headers>>)
}

function readsAs(read: Record<string, unknown>): VisionProvider {
  return { extractLabel: async () => LabelScanExtractionSchema.parse({ source: 'llm_extracted', ...read }) }
}

/**
 * The registry answers the tier-1 key with `tier1` and the tier-2 key with
 * `tier2`; asking for tier 2 when none is given fails the scan loudly.
 */
function stubVisionTiers(tier1: VisionProvider, tier2?: VisionProvider) {
  getVisionProviderMock.mockImplementation((key) => {
    if (key === 'anthropic-haiku-5-5') return tier1
    if (key === 'anthropic-sonnet-5-5' && tier2) return tier2
    throw new Error(`unexpected vision provider key: ${key}`)
  })
}

function jpegFormData(locale = 'en'): FormData {
  const fd = new FormData()
  fd.set('image', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }))
  fd.set('locale', locale)
  return fd
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

// --- The read, and what it cost ---------------------------------------

describe('scanAction — reading the label', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('answers with the cheap model’s match and records that tier 2 was not needed', async () => {
    stubEmptyRequestContext()
    stubVisionTiers(readsAs(DASSAI_EXTRACTION))
    resolveScannedLabelMock.mockResolvedValueOnce({ kind: 'exact', sake: DASSAI_BRAND })
    lookupBreweryByBrandMock.mockResolvedValueOnce(ASAHI_SHUZO)

    const state = await scanAction(INITIAL_SCAN_ACTION_STATE, jpegFormData())

    expect(state).toMatchObject({ status: 'matched', brandId: 100, sakeHref: '/en/sake/100?from=scan', breweryRomaji: 'Asahi Shuzo' })
    expect(getVisionProviderMock).toHaveBeenCalledTimes(1)
    expect(recordActionMetadataMock).toHaveBeenCalledWith({ 'scan.tier1Status': 'matched', 'scan.tier2Used': false })
  })

  it('records the tier-1 outcome and the tier-2 model when the better model had to read it again', async () => {
    stubEmptyRequestContext()
    stubVisionTiers(readsAs(DASSAI_EXTRACTION), readsAs(DASSAI_EXTRACTION))
    resolveScannedLabelMock
      .mockResolvedValueOnce({ kind: 'no_match', query: { nameJa: '獺祭', breweryJa: '旭酒造' } })
      .mockResolvedValueOnce({ kind: 'exact', sake: DASSAI_BRAND })
    lookupBreweryByBrandMock.mockResolvedValueOnce(ASAHI_SHUZO)

    const state = await scanAction(INITIAL_SCAN_ACTION_STATE, jpegFormData())

    expect(state.status).toBe('matched')
    expect(getVisionProviderMock).toHaveBeenCalledWith('anthropic-sonnet-5-5')
    expect(recordActionMetadataMock).toHaveBeenCalledWith({
      'scan.tier1Status': 'no_match',
      'scan.tier2Used': true,
      'scan.tier2Provider': 'anthropic-sonnet-5-5',
    })
  })

  it('sends a second photo to tier 2 at once and records whether the earlier read was needed', async () => {
    stubEmptyRequestContext()
    stubVisionTiers(readsAs({ ...DASSAI_EXTRACTION, name_ja: 'never read' }), readsAs(DASSAI_EXTRACTION))
    resolveScannedLabelMock.mockResolvedValueOnce({ kind: 'exact', sake: DASSAI_BRAND })
    lookupBreweryByBrandMock.mockResolvedValueOnce(ASAHI_SHUZO)
    const formData = jpegFormData()
    formData.set('earlierRead', JSON.stringify({ name_ja: '人気一', brewery_ja: '人気酒造', other_names: [], confidence: 0.7 }))

    const state = await scanAction(INITIAL_SCAN_ACTION_STATE, formData)

    expect(state.status).toBe('matched')
    expect(getVisionProviderMock).toHaveBeenCalledTimes(1)
    expect(getVisionProviderMock).toHaveBeenCalledWith('anthropic-sonnet-5-5')
    expect(recordActionMetadataMock).toHaveBeenCalledWith(expect.objectContaining({ 'scan.tier1Status': 'skipped_second_photo' }))
    expect(recordActionMetadataMock).toHaveBeenCalledWith({ 'scan.earlierRead': 'not_needed' })
  })

  it('reads a malformed earlier read as a first scan', async () => {
    stubEmptyRequestContext()
    stubVisionTiers(readsAs(DASSAI_EXTRACTION))
    resolveScannedLabelMock.mockResolvedValueOnce({ kind: 'exact', sake: DASSAI_BRAND })
    lookupBreweryByBrandMock.mockResolvedValueOnce(ASAHI_SHUZO)
    const formData = jpegFormData()
    formData.set('earlierRead', 'not json')

    await scanAction(INITIAL_SCAN_ACTION_STATE, formData)

    expect(getVisionProviderMock).toHaveBeenCalledWith('anthropic-haiku-5-5')
    expect(recordActionMetadataMock).not.toHaveBeenCalledWith(expect.objectContaining({ 'scan.earlierRead': expect.anything() }))
  })
})

describe('scanAction — the visitor’s own bottlings of the matched sake', () => {
  afterEach(() => {
    vi.clearAllMocks()
    assertRateLimitConfigMock.mockReturnValue(null)
  })

  it('lists them with the one the label names first', async () => {
    stubEmptyRequestContext()
    stubVisionTiers(readsAs({ ...DASSAI_EXTRACTION, bottling: { grade: 'junmai_daiginjo' } }))
    resolveScannedLabelMock.mockResolvedValueOnce({ kind: 'exact', sake: DASSAI_BRAND })
    lookupBreweryByBrandMock.mockResolvedValueOnce(ASAHI_SHUZO)
    resolveViewerJournalMock.mockResolvedValueOnce({
      canLog: true,
      entries: [],
      cellar: [],
      expressions: [
        { id: 'a', name: 'Dassai Junmai Ginjo', brandId: DASSAI_BRAND.brandId },
        { id: 'b', name: 'Dassai 45 Junmai Daiginjo', brandId: DASSAI_BRAND.brandId },
        { id: 'c', name: 'Another sake’s bottling', brandId: DASSAI_BRAND.brandId + 1 },
      ],
    })

    const state = await scanAction(INITIAL_SCAN_ACTION_STATE, jpegFormData())

    expect(state.status).toBe('matched')
    if (state.status === 'matched') {
      expect(state.ownBottlings).toEqual([
        { id: 'b', name: 'Dassai 45 Junmai Daiginjo', fitsLabel: true },
        { id: 'a', name: 'Dassai Junmai Ginjo', fitsLabel: false },
      ])
    }
  })

  it('keeps the match when the journal cannot be read', async () => {
    stubEmptyRequestContext()
    stubVisionTiers(readsAs(DASSAI_EXTRACTION))
    resolveScannedLabelMock.mockResolvedValueOnce({ kind: 'exact', sake: DASSAI_BRAND })
    lookupBreweryByBrandMock.mockResolvedValueOnce(ASAHI_SHUZO)
    resolveViewerJournalMock.mockRejectedValueOnce(new Error('store down'))

    const state = await scanAction(INITIAL_SCAN_ACTION_STATE, jpegFormData())

    expect(state.status).toBe('matched')
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
