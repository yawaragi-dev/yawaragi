import { afterEach, describe, expect, it, vi } from 'vitest'
import { getBrands, getBreweries, getFlavorCharts, SakenowaError } from './client'

const stubFetch = (impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) => {
  vi.stubGlobal('fetch', vi.fn(impl))
}

const okJson = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getBrands', () => {
  it('returns parsed brands on a successful response', async () => {
    stubFetch(async () =>
      okJson({
        brands: [
          { id: 1, name: '麗人', breweryId: 49 },
          { id: 2, name: '十四代', breweryId: 100 },
        ],
      }),
    )

    const brands = await getBrands()
    expect(brands).toEqual([
      { id: 1, name: '麗人', breweryId: 49 },
      { id: 2, name: '十四代', breweryId: 100 },
    ])
  })

  it('hits the documented Sakenowa /brands endpoint', async () => {
    const fetchSpy = vi.fn<typeof fetch>(async () => okJson({ brands: [] }))
    vi.stubGlobal('fetch', fetchSpy)

    await getBrands({ onSkippedRows: () => {} })

    expect(fetchSpy).toHaveBeenCalledOnce()
    expect(fetchSpy).toHaveBeenCalledWith('https://muro.sakenowa.com/sakenowa-data/api/brands')
  })

  it('throws SakenowaError on network failure', async () => {
    stubFetch(async () => {
      throw new TypeError('network down')
    })

    await expect(getBrands()).rejects.toThrow(SakenowaError)
  })

  it('throws SakenowaError on non-2xx response', async () => {
    stubFetch(async () => new Response('', { status: 500, statusText: 'Internal Server Error' }))

    await expect(getBrands()).rejects.toThrow(/500/)
  })

  it('throws SakenowaError on non-JSON body', async () => {
    stubFetch(async () => new Response('<html>not json</html>', { status: 200 }))

    await expect(getBrands()).rejects.toThrow(/non-JSON/)
  })

  it('skips malformed rows and reports them rather than throwing', async () => {
    // Sakenowa publishes some placeholder rows (slice 5 PR triggered this).
    // The whole envelope is good; one row is bad — return the good rows
    // and route the bad-row count through the reporter.
    stubFetch(async () =>
      okJson({
        brands: [
          { id: 1, name: '麗人', breweryId: 49 },
          { id: 2, breweryId: 100 }, // missing name
        ],
      }),
    )
    const skipped: unknown[] = []

    const brands = await getBrands({ onSkippedRows: (info) => skipped.push(info) })

    expect(brands).toEqual([{ id: 1, name: '麗人', breweryId: 49 }])
    expect(skipped).toHaveLength(1)
    expect(skipped[0]).toMatchObject({ endpoint: '/brands', skipped: 1, total: 2 })
    expect((skipped[0] as { summary: string }).summary).toContain('[1.name]')
  })

  it('returns an empty list when every row is malformed and reports them all', async () => {
    stubFetch(async () => okJson({ brands: [{ id: 0 }, { id: 'nope' }] }))
    const skipped: unknown[] = []

    const brands = await getBrands({ onSkippedRows: (info) => skipped.push(info) })

    expect(brands).toEqual([])
    expect(skipped[0]).toMatchObject({ skipped: 2, total: 2 })
  })

  it('does not include rejected field values in the skip summary', async () => {
    // Forward-looking: when this same row-filter shape is reused for LLM
    // outputs (label scan, generated tasting notes), the summary must not
    // become a PII smuggling channel.
    const SENTINEL = 'CUSTOMER-EMAIL@example.com'
    stubFetch(async () =>
      okJson({
        brands: [{ id: 1, name: SENTINEL, breweryId: 'wrong-type-with-' + SENTINEL }],
      }),
    )
    const skipped: { summary?: string }[] = []

    await getBrands({ onSkippedRows: (info) => skipped.push(info) })

    expect(skipped[0].summary).not.toContain(SENTINEL)
  })

  it('throws SakenowaError when "brands" envelope is missing', async () => {
    stubFetch(async () => okJson([{ id: 1, name: '麗人', breweryId: 49 }]))

    await expect(getBrands()).rejects.toThrow(/envelope failed schema validation/)
  })

  it('envelope-drift error names the missing key without disclosing payload', async () => {
    stubFetch(async () => okJson({ items: [], copyright: 'irrelevant-value' }))

    await expect(getBrands()).rejects.toThrow(/\[brands\]/)
  })
})

describe('getBreweries', () => {
  it('returns parsed breweries on a successful response', async () => {
    stubFetch(async () =>
      okJson({
        breweries: [
          { id: 49, name: '麗人酒造', areaId: 20 },
          { id: 100, name: '高木酒造', areaId: 6 },
        ],
      }),
    )

    const breweries = await getBreweries()
    expect(breweries).toEqual([
      { id: 49, name: '麗人酒造', areaId: 20 },
      { id: 100, name: '高木酒造', areaId: 6 },
    ])
  })

  it('hits the documented Sakenowa /breweries endpoint', async () => {
    const fetchSpy = vi.fn<typeof fetch>(async () => okJson({ breweries: [] }))
    vi.stubGlobal('fetch', fetchSpy)

    await getBreweries({ onSkippedRows: () => {} })

    expect(fetchSpy).toHaveBeenCalledOnce()
    expect(fetchSpy).toHaveBeenCalledWith('https://muro.sakenowa.com/sakenowa-data/api/breweries')
  })

  it('throws SakenowaError on network failure', async () => {
    stubFetch(async () => {
      throw new TypeError('network down')
    })

    await expect(getBreweries()).rejects.toThrow(SakenowaError)
  })

  it('throws SakenowaError on non-2xx response', async () => {
    stubFetch(async () => new Response('', { status: 500, statusText: 'Internal Server Error' }))

    await expect(getBreweries()).rejects.toThrow(/500/)
  })

  it('throws SakenowaError on non-JSON body', async () => {
    stubFetch(async () => new Response('<html>not json</html>', { status: 200 }))

    await expect(getBreweries()).rejects.toThrow(/non-JSON/)
  })

  it('ingests Sakenowa placeholder rows (empty name) — brands FK against them', async () => {
    // Sakenowa publishes ~48 placeholder breweries with empty names as
    // "specific brewery within prefecture unknown" sentinels. ~274 brands
    // FK against them; we must not drop them on the floor.
    stubFetch(async () =>
      okJson({
        breweries: [
          { id: 49, name: '麗人酒造', areaId: 20 },
          { id: 784, name: '', areaId: 1 },
          { id: 785, name: '', areaId: 2 },
          { id: 100, name: '高木酒造', areaId: 6 },
        ],
      }),
    )
    const skipped: unknown[] = []

    const breweries = await getBreweries({ onSkippedRows: (info) => skipped.push(info) })

    expect(breweries).toEqual([
      { id: 49, name: '麗人酒造', areaId: 20 },
      { id: 784, name: '', areaId: 1 },
      { id: 785, name: '', areaId: 2 },
      { id: 100, name: '高木酒造', areaId: 6 },
    ])
    expect(skipped).toHaveLength(0)
  })

  it('ingests foreign-producer rows (areaId 0) — brands FK against them too', async () => {
    // Sakenowa parks non-Japanese breweries (Taiwan Tobacco & Liquor Corp,
    // Korean producers) under areaId 0 because they don't fit the
    // 47-prefecture scheme. Real rows, must be preserved.
    stubFetch(async () =>
      okJson({
        breweries: [
          { id: 49, name: '麗人酒造', areaId: 20 },
          { id: 1481, name: '臺灣菸酒股份有限公司', areaId: 0 },
        ],
      }),
    )
    const skipped: unknown[] = []

    const breweries = await getBreweries({ onSkippedRows: (info) => skipped.push(info) })

    expect(breweries).toContainEqual({ id: 1481, name: '臺灣菸酒股份有限公司', areaId: 0 })
    expect(skipped).toHaveLength(0)
  })

  it('still skips truly malformed rows (wrong types / missing required fields)', async () => {
    stubFetch(async () =>
      okJson({
        breweries: [
          { id: 49, name: '麗人酒造', areaId: 20 },
          { id: 'not-a-number', name: 'x', areaId: 1 },
          { id: 50 }, // missing name + areaId
        ],
      }),
    )
    const skipped: unknown[] = []

    const breweries = await getBreweries({ onSkippedRows: (info) => skipped.push(info) })

    expect(breweries).toEqual([{ id: 49, name: '麗人酒造', areaId: 20 }])
    expect(skipped[0]).toMatchObject({ skipped: 2, total: 3 })
  })

  it('throws SakenowaError when "breweries" envelope is missing', async () => {
    stubFetch(async () => okJson([{ id: 49, name: '麗人酒造', areaId: 20 }]))

    await expect(getBreweries()).rejects.toThrow(/envelope failed schema validation/)
  })
})

describe('getFlavorCharts', () => {
  const sample = {
    brandId: 2,
    f1: 0.27,
    f2: 0.51,
    f3: 0.31,
    f4: 0.42,
    f5: 0.46,
    f6: 0.42,
  } as const

  it('returns parsed flavor charts on a successful response', async () => {
    stubFetch(async () => okJson({ flavorCharts: [sample] }))

    const charts = await getFlavorCharts()
    expect(charts).toEqual([sample])
  })

  it('hits the documented Sakenowa /flavor-charts endpoint', async () => {
    const fetchSpy = vi.fn<typeof fetch>(async () => okJson({ flavorCharts: [] }))
    vi.stubGlobal('fetch', fetchSpy)

    await getFlavorCharts({ onSkippedRows: () => {} })

    expect(fetchSpy).toHaveBeenCalledOnce()
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://muro.sakenowa.com/sakenowa-data/api/flavor-charts',
    )
  })

  it('throws SakenowaError on network failure', async () => {
    stubFetch(async () => {
      throw new TypeError('network down')
    })

    await expect(getFlavorCharts()).rejects.toThrow(SakenowaError)
  })

  it('throws SakenowaError on non-2xx response', async () => {
    stubFetch(async () => new Response('', { status: 500, statusText: 'Internal Server Error' }))

    await expect(getFlavorCharts()).rejects.toThrow(/500/)
  })

  it('throws SakenowaError on non-JSON body', async () => {
    stubFetch(async () => new Response('<html>not json</html>', { status: 200 }))

    await expect(getFlavorCharts()).rejects.toThrow(/non-JSON/)
  })

  it('skips malformed rows and reports them rather than throwing', async () => {
    stubFetch(async () =>
      okJson({
        flavorCharts: [
          sample,
          { brandId: 3, f1: 1.5, f2: 0.5, f3: 0.5, f4: 0.5, f5: 0.5, f6: 0.5 }, // f1 out of range
        ],
      }),
    )
    const skipped: unknown[] = []

    const charts = await getFlavorCharts({ onSkippedRows: (info) => skipped.push(info) })

    expect(charts).toEqual([sample])
    expect(skipped).toHaveLength(1)
    expect(skipped[0]).toMatchObject({ endpoint: '/flavor-charts', skipped: 1, total: 2 })
    expect((skipped[0] as { summary: string }).summary).toContain('[1.f1]')
  })

  it('throws SakenowaError when "flavorCharts" envelope is missing', async () => {
    stubFetch(async () => okJson([sample]))

    await expect(getFlavorCharts()).rejects.toThrow(/envelope failed schema validation/)
  })

  it('does not include rejected field values in the skip summary', async () => {
    // Same forward-looking PII guard as the brands path — if a future
    // Sakenowa drift surfaces sensitive content, the summary stays a
    // path/code report, never the raw value.
    const SENTINEL = 'CUSTOMER-EMAIL@example.com'
    stubFetch(async () =>
      okJson({
        flavorCharts: [{ brandId: 'bogus-' + SENTINEL, f1: 0.5, f2: 0.5, f3: 0.5, f4: 0.5, f5: 0.5, f6: 0.5 }],
      }),
    )
    const skipped: { summary?: string }[] = []

    await getFlavorCharts({ onSkippedRows: (info) => skipped.push(info) })

    expect(skipped[0].summary).not.toContain(SENTINEL)
  })
})
