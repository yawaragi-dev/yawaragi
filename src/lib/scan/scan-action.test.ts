import { afterEach, describe, expect, it, vi } from 'vitest'

// What the scan itself owns: parsing the form before it pays, what it does
// with a refused or admitted request and the budget left, handing the
// photo to the label pipeline with the registry's two tiers, recording what
// the read cost on the Langfuse span, and adding the visitor's own bottlings
// to a match. Where a read lands — the two-tier rule, every result state,
// the guesses, the second photo — is `read-label.test.ts`, against fakes.
// The end-to-end flow runs in `e2e/scan-*.spec.ts` with VISION_PROVIDER=e2e-stub.

// The meter — debug log, span, rate limit before the model, usage counter —
// is tested once in `metered-call.test.ts`. Here it admits or refuses as
// each test says, so these tests are about what the scan does either way.
vi.mock('@/lib/metering/metered-call', () => import('@/lib/metering/fake-metered-call'))

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

import { fakeMeter, resetFakeMeter } from '@/lib/metering/fake-metered-call'
import { getVisionProvider } from '@/lib/ai/vision/registry'
import type { VisionProvider } from '@/lib/ai/vision/vision-provider'
import { recordActionMetadata } from '@/lib/ai/observability/action-span'
import { resolveScannedLabel } from '@/lib/sakenowa/resolve-scanned-label'
import { lookupBreweryByBrand } from '@/lib/sakenowa/catalogue-reads'
import { LabelScanExtractionSchema } from '@/lib/schemas/label-scan-extraction'
import { scanLabel } from './scan-action'
import type { Brand } from '@/lib/schemas/brand'
import type { Brewery } from '@/lib/schemas/brewery'

const getVisionProviderMock = vi.mocked(getVisionProvider)
const resolveScannedLabelMock = vi.mocked(resolveScannedLabel)
const lookupBreweryByBrandMock = vi.mocked(lookupBreweryByBrand)
const recordActionMetadataMock = vi.mocked(recordActionMetadata)

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

function readsAs(read: Record<string, unknown>): VisionProvider {
  return {
    extractLabel: async () => LabelScanExtractionSchema.parse({ source: 'llm_extracted', ...read }),
    readBottles: async () => Promise.reject(new Error('no bottles read was expected')),
  }
}

/** The registry answers the scan's one model (#414) with `provider`; any other key fails the scan loudly. */
function stubVisionTiers(provider: VisionProvider) {
  getVisionProviderMock.mockImplementation((key) => {
    if (key === 'anthropic-sonnet-5-5') return provider
    throw new Error(`unexpected vision provider key: ${key}`)
  })
}

function jpegFormData(locale = 'en'): FormData {
  const fd = new FormData()
  fd.set('image', new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }))
  fd.set('locale', locale)
  return fd
}

afterEach(() => {
  resetFakeMeter()
})

// --- Input validation ------------------------------------------------

describe('scanLabel — input validation', () => {
  it('rejects a submission with no image blob before it pays for a scan', async () => {
    const fd = new FormData()
    fd.set('locale', 'en')
    const state = await scanLabel(fd)

    expect(state.status).toBe('invalid_input')
    if (state.status === 'invalid_input') {
      expect(state.reason).toBe('missing_image')
    }
    // The rate limit is never taken when the image is missing.
    expect(fakeMeter.calls).toEqual([expect.objectContaining({ paid: false })])
    expect(getVisionProviderMock).not.toHaveBeenCalled()
  })

  it('rejects a submission with an empty (zero-byte) image blob', async () => {
    const fd = new FormData()
    fd.set('image', new Blob([], { type: 'image/jpeg' }))
    fd.set('locale', 'en')
    const state = await scanLabel(fd)

    expect(state.status).toBe('invalid_input')
    if (state.status === 'invalid_input') {
      expect(state.reason).toBe('missing_image')
    }
    expect(fakeMeter.calls[0]?.paid).toBe(false)
    expect(getVisionProviderMock).not.toHaveBeenCalled()
  })

  it('rejects a submission whose locale is not a configured routing locale', async () => {
    const fd = new FormData()
    fd.set('image', new Blob([new Uint8Array([1])], { type: 'image/jpeg' }))
    // The routing manifest declares ['en', 'de']; a stale client build
    // could POST a locale from a since-removed manifest entry.
    fd.set('locale', 'fr')
    const state = await scanLabel(fd)

    expect(state.status).toBe('invalid_input')
    if (state.status === 'invalid_input') {
      expect(state.reason).toBe('unsupported_locale')
    }
    expect(fakeMeter.calls[0]?.paid).toBe(false)
    expect(getVisionProviderMock).not.toHaveBeenCalled()
  })

  it('rejects a submission whose locale form field is missing entirely', async () => {
    // Not the same as an unsupported locale — the client failed to
    // include the field at all. The action must treat this as
    // unsupported_locale (the tagged-state grammar has no
    // "missing_locale" variant, so the two collapse into one).
    const fd = new FormData()
    fd.set('image', new Blob([new Uint8Array([1])], { type: 'image/jpeg' }))
    const state = await scanLabel(fd)

    expect(state.status).toBe('invalid_input')
    if (state.status === 'invalid_input') {
      expect(state.reason).toBe('unsupported_locale')
    }
  })
})

// --- The meter: which budget, refused, admitted ------------------------

describe('scanLabel — the scan budget', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('spends the vision-scan budget under the scan-action span and counts the scan by its outcome', async () => {
    stubVisionTiers(readsAs(DASSAI_EXTRACTION))
    resolveScannedLabelMock.mockResolvedValueOnce({ kind: 'exact', sake: DASSAI_BRAND })
    lookupBreweryByBrandMock.mockResolvedValueOnce(ASAHI_SHUZO)

    await scanLabel(jpegFormData())

    expect(fakeMeter.calls).toEqual([
      { bucket: 'vision-scan', span: 'scan-action', paid: true, counted: 'scan:matched' },
    ])
  })

  it('answers session_missing without reading the label when the request has no session cookie', async () => {
    fakeMeter.next = { status: 'session_missing' }

    const state = await scanLabel(jpegFormData())

    expect(state.status).toBe('session_missing')
    expect(getVisionProviderMock).not.toHaveBeenCalled()
  })

  it('answers rate_limited without reading the label once the free scans are used', async () => {
    fakeMeter.next = { status: 'rate_limited', retryAfterSec: 3600 }

    const state = await scanLabel(jpegFormData())

    expect(state).toEqual({ status: 'rate_limited', retryAfterSec: 3600 })
    expect(getVisionProviderMock).not.toHaveBeenCalled()
    expect(fakeMeter.calls[0]?.counted).toBe('scan:rate_limited')
  })

  it('tells the visitor how many free scans are left after this one', async () => {
    fakeMeter.next = { remaining: 1 }
    stubVisionTiers(readsAs(DASSAI_EXTRACTION))
    resolveScannedLabelMock.mockResolvedValueOnce({ kind: 'exact', sake: DASSAI_BRAND })
    lookupBreweryByBrandMock.mockResolvedValueOnce(ASAHI_SHUZO)

    const state = await scanLabel(jpegFormData())

    expect(state).toMatchObject({ status: 'matched', scansLeft: 1 })
  })

  it('says nothing about scans left where none are counted', async () => {
    stubVisionTiers(readsAs(DASSAI_EXTRACTION))
    resolveScannedLabelMock.mockResolvedValueOnce({ kind: 'exact', sake: DASSAI_BRAND })
    lookupBreweryByBrandMock.mockResolvedValueOnce(ASAHI_SHUZO)

    const state = await scanLabel(jpegFormData())

    expect(state).not.toHaveProperty('scansLeft')
  })
})

// --- The read, and what it cost ---------------------------------------

describe('scanLabel — reading the label', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('reads the label once, with Sonnet, and records that no second model was asked', async () => {
    stubVisionTiers(readsAs(DASSAI_EXTRACTION))
    resolveScannedLabelMock.mockResolvedValueOnce({ kind: 'exact', sake: DASSAI_BRAND })
    lookupBreweryByBrandMock.mockResolvedValueOnce(ASAHI_SHUZO)

    const state = await scanLabel(jpegFormData())

    expect(state).toMatchObject({ status: 'matched', brandId: 100, sakeHref: '/en/sake/100?from=scan', breweryRomaji: 'Asahi Shuzo' })
    expect(getVisionProviderMock).toHaveBeenCalledTimes(1)
    expect(recordActionMetadataMock).toHaveBeenCalledWith({ 'scan.tier1Status': 'matched', 'scan.tier2Used': false })
  })

  it('answers with that one read even when it found nothing', async () => {
    stubVisionTiers(readsAs(DASSAI_EXTRACTION))
    resolveScannedLabelMock.mockResolvedValueOnce({ kind: 'no_match', query: { nameJa: '獺祭', breweryJa: '旭酒造' } })

    const state = await scanLabel(jpegFormData())

    expect(state.status).toBe('no_match')
    expect(getVisionProviderMock).toHaveBeenCalledTimes(1)
    expect(recordActionMetadataMock).toHaveBeenCalledWith({ 'scan.tier1Status': 'no_match', 'scan.tier2Used': false })
  })

  it('reads a second photo with the same model and records whether the earlier read was needed', async () => {
    stubVisionTiers(readsAs(DASSAI_EXTRACTION))
    resolveScannedLabelMock.mockResolvedValueOnce({ kind: 'exact', sake: DASSAI_BRAND })
    lookupBreweryByBrandMock.mockResolvedValueOnce(ASAHI_SHUZO)
    const formData = jpegFormData()
    formData.set('earlierRead', JSON.stringify({ name_ja: '人気一', brewery_ja: '人気酒造', other_names: [], confidence: 0.7 }))

    const state = await scanLabel(formData)

    expect(state.status).toBe('matched')
    expect(getVisionProviderMock).toHaveBeenCalledTimes(1)
    expect(recordActionMetadataMock).toHaveBeenCalledWith({ 'scan.earlierRead': 'not_needed' })
  })

  it('reads a malformed earlier read as a first scan', async () => {
    stubVisionTiers(readsAs(DASSAI_EXTRACTION))
    resolveScannedLabelMock.mockResolvedValueOnce({ kind: 'exact', sake: DASSAI_BRAND })
    lookupBreweryByBrandMock.mockResolvedValueOnce(ASAHI_SHUZO)
    const formData = jpegFormData()
    formData.set('earlierRead', 'not json')

    await scanLabel(formData)

    expect(getVisionProviderMock).toHaveBeenCalledWith('anthropic-sonnet-5-5')
    expect(recordActionMetadataMock).not.toHaveBeenCalledWith(expect.objectContaining({ 'scan.earlierRead': expect.anything() }))
  })
})

describe('scanLabel — the visitor’s own bottlings of the matched sake', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('lists them with the one the label names first', async () => {
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

    const state = await scanLabel(jpegFormData())

    expect(state.status).toBe('matched')
    if (state.status === 'matched') {
      expect(state.ownBottlings).toEqual([
        { id: 'b', name: 'Dassai 45 Junmai Daiginjo', fitsLabel: true },
        { id: 'a', name: 'Dassai Junmai Ginjo', fitsLabel: false },
      ])
    }
  })

  it('keeps the match when the journal cannot be read', async () => {
    stubVisionTiers(readsAs(DASSAI_EXTRACTION))
    resolveScannedLabelMock.mockResolvedValueOnce({ kind: 'exact', sake: DASSAI_BRAND })
    lookupBreweryByBrandMock.mockResolvedValueOnce(ASAHI_SHUZO)
    resolveViewerJournalMock.mockRejectedValueOnce(new Error('store down'))

    const state = await scanLabel(jpegFormData())

    expect(state.status).toBe('matched')
  })
})
