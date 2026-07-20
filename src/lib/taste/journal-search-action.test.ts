import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Brand } from '@/lib/schemas/brand'

vi.mock('@/lib/auth/maintainer', () => ({
  currentUserIsMaintainer: vi.fn(async () => true),
}))
vi.mock('@/lib/sakenowa/search-brands', () => ({
  searchBrands: vi.fn(),
}))

import { currentUserIsMaintainer } from '@/lib/auth/maintainer'
import { searchBrands } from '@/lib/sakenowa/search-brands'
import { searchJournalSake } from '@/lib/taste/journal-search-action'

const brand = (over: Partial<Brand> = {}): Brand => ({
  brandId: 1,
  name: 'Nabeshima',
  nameKanji: '鍋島',
  nameRomaji: 'Nabeshima',
  breweryId: 9,
  source: 'sakenowa',
  ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(currentUserIsMaintainer).mockResolvedValue(true)
  vi.mocked(searchBrands).mockResolvedValue([brand()])
})

describe('searchJournalSake', () => {
  it('returns trimmed candidates for a maintainer', async () => {
    const results = await searchJournalSake('nabe')
    expect(results).toEqual([{ brandId: 1, nameKanji: '鍋島', nameRomaji: 'Nabeshima' }])
    expect(searchBrands).toHaveBeenCalledWith('nabe')
  })

  it('returns nothing for a non-maintainer without hitting the DB', async () => {
    vi.mocked(currentUserIsMaintainer).mockResolvedValue(false)
    expect(await searchJournalSake('nabe')).toEqual([])
    expect(searchBrands).not.toHaveBeenCalled()
  })
})
