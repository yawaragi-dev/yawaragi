import { afterEach, describe, expect, it, vi } from 'vitest'
import { getBrands, SakenowaError } from './client'

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

    await getBrands()

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

  it('throws SakenowaError when the response shape drifts', async () => {
    // Simulates Sakenowa adding a new required field or removing one Yawaragi expects (US #31).
    stubFetch(async () => okJson({ brands: [{ id: 1, breweryId: 49 }] }))

    await expect(getBrands()).rejects.toThrow(/schema validation/)
  })

  it('throws SakenowaError when "brands" envelope is missing', async () => {
    stubFetch(async () => okJson([{ id: 1, name: '麗人', breweryId: 49 }]))

    await expect(getBrands()).rejects.toThrow(/schema validation/)
  })
})
