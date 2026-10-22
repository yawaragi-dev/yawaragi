// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { handleSuggestRequest } from './route'

const DASSAI = { brandId: 1, nameKanji: '獺祭', nameRomaji: 'Dassai', breweryKanji: '旭酒造', breweryRomaji: 'Asahi Shuzo' }

describe('GET /api/search-suggest', () => {
  it('shows no sake data to a visitor who has not passed the 18+ gate', async () => {
    const suggest = vi.fn(async () => [DASSAI])
    const res = await handleSuggestRequest(new Request('http://x/api/search-suggest?q=da'), {
      gateAccepted: async () => false,
      suggest,
    })
    expect(res.status).toBe(403)
    expect(suggest).not.toHaveBeenCalled()
  })

  it('returns the matching sakes, each with the page it opens in the visitor’s language', async () => {
    const res = await handleSuggestRequest(new Request('http://x/api/search-suggest?q=dass&locale=de'), {
      gateAccepted: async () => true,
      suggest: async () => [DASSAI],
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toContain('no-store')
    const body = await res.json()
    expect(body.query).toBe('dass')
    expect(body.rows).toEqual([{ ...DASSAI, href: '/de/sake/1' }])
  })

  it('names the prefecture on each row, as the search results do', async () => {
    const res = await handleSuggestRequest(new Request('http://x/api/search-suggest?q=dass&locale=en'), {
      gateAccepted: async () => true,
      suggest: async () => [{ ...DASSAI, areaId: 35 }],
    })
    expect((await res.json()).rows[0].prefecture).toBe('Yamaguchi')
  })
})
