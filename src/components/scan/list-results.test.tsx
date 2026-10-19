import { fireEvent, render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import en from '~/messages/en.json'
import type { ListResult, ListRow } from '@/lib/scan/list-action-state'

vi.mock('@/lib/collection/expression-actions', () => ({ addOwnBottling: vi.fn() }))

const { ListResults } = await import('./list-results')

const CHART = { source: 'sakenowa' as const, brandId: 1, f1: 0.2, f2: 0.5, f3: 0.8, f4: 0.3, f5: 0.75, f6: 0.2 }

const row = (over: Partial<ListRow> & Pick<ListRow, 'brandId' | 'nameRomaji'>): ListRow => ({
  sakeHref: `/en/sake/${over.brandId}?from=scan`,
  nameKanji: '酒',
  chart: CHART,
  lines: [{ index: 0, printed: '酒', nameAsPrinted: '酒' }],
  fit: 'close',
  reason: { kind: 'axes', axes: ['f3', 'f5'] },
  yourRating: null,
  ...over,
})

const RANKED: ListResult = {
  kind: 'menu',
  currency: 'JPY',
  ranked: true,
  tastings: 5,
  unreadableCount: 0,
  unmatched: [],
  notSake: [],
  rows: [
    row({
      brandId: 1,
      nameRomaji: 'Akishika',
      nameKanji: '秋鹿',
      lines: [{ index: 1, printed: '秋鹿 奥鹿 純米', nameAsPrinted: '秋鹿 奥鹿', productRomaji: 'Okuharuka', grade: 'junmai', price: 950, warm: true }],
      reason: { kind: 'like', axes: ['f3', 'f5'], like: { name: 'Kidoizumi AFS', rating: 4.5 } },
    }),
    row({
      brandId: 2,
      nameRomaji: 'Dassai',
      lines: [{ index: 0, printed: '獺祭', nameAsPrinted: '獺祭', price: 1300 }],
      fit: 'unusual',
      reason: { kind: 'tasted', rating: 3, axes: ['f1', 'f6'] },
      yourRating: 3,
    }),
  ],
}

function renderList(result: ListResult) {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <ListResults result={result} onBack={vi.fn()} onRetake={vi.fn()} />
    </NextIntlClientProvider>,
  )
}

describe('§7 — a menu ranked for the visitor', () => {
  it('names the first sake for the visitor, and says why each sits where it does in words', () => {
    renderList(RANKED)
    expect(screen.getByRole('heading', { name: 'Order the Akishika' })).toBeTruthy()
    const [first, second] = screen.getAllByTestId('list-row')
    expect(within(first).getByTestId('list-row-name').textContent).toBe('Akishika Okuharuka')
    expect(within(first).getByTestId('list-row-reason').textContent).toBe('Rich and dry, like the Kidoizumi AFS you gave 4.5.')
    expect(within(first).getByTestId('list-row-fit').textContent).toBe('Close to what you rate highly')
    expect(within(first).getByTestId('list-row-price').textContent).toBe('¥950')
    expect(within(second).getByTestId('list-row-reason').textContent).toBe('You gave it 3. Floral and light.')
    expect(within(second).getByTestId('list-row-yours').textContent).toBe('★ 3 · yours')
    expect(screen.getByTestId('list-rows').textContent).not.toMatch(/%/)
  })

  it('puts the list back in menu order, and narrows it with the chips', () => {
    renderList(RANKED)
    fireEvent.click(screen.getByTestId('list-sort-listOrder'))
    expect(screen.getAllByTestId('list-row-name').map((n) => n.textContent)).toEqual(['Dassai', 'Akishika Okuharuka'])
    fireEvent.click(screen.getByTestId('list-chip-cheap'))
    expect(screen.getByTestId('list-rows').textContent).not.toContain('Dassai')
    fireEvent.click(screen.getByTestId('list-chip-new'))
    expect(screen.getAllByTestId('list-row-name').map((n) => n.textContent)).toEqual(['Akishika Okuharuka'])
  })

  it('below three tastings, lists the menu as printed with no fit, and says how far the visitor is', () => {
    renderList({
      ...RANKED,
      ranked: false,
      tastings: 2,
      rows: RANKED.rows.map((r) => ({ ...r, fit: null, reason: { kind: 'axes', axes: ['f3', 'f5'] } })),
    })
    expect(screen.getByRole('heading', { name: 'What’s on this menu' })).toBeTruthy()
    expect(screen.getByTestId('list-rate-three').textContent).toContain('2 of 3 so far')
    expect(screen.queryByTestId('list-sort-forYou')).toBeNull()
    expect(screen.queryByTestId('list-row-fit')).toBeNull()
  })

  it('marks what it read off the menu as read by AI', () => {
    renderList(RANKED)
    expect(screen.getByTestId('list-read-badge').textContent).toContain('Read by AI')
  })

  it('says what each bottling of one sake is, not only how it was printed', () => {
    renderList({
      ...RANKED,
      rows: [
        row({
          brandId: 3,
          nameRomaji: 'Jikon',
          lines: [
            { index: 0, printed: '而今 純米吟醸 生', nameAsPrinted: '而今', grade: 'junmai_ginjo', styles: ['nama'] },
            { index: 1, printed: '而今 特別純米', nameAsPrinted: '而今', grade: 'tokubetsu_junmai' },
          ],
        }),
      ],
    })
    const [nama, tokujun] = screen.getAllByTestId('list-row-bottling')
    expect(nama.textContent).toContain('Junmai Ginjō · Nama')
    expect(tokujun.textContent).toContain('Tokubetsu Junmai')
  })

  it('points out what is less usual on the list, in one line, and only that', () => {
    renderList({
      ...RANKED,
      rows: [
        row({ brandId: 4, nameRomaji: 'Akishika', lines: [{ index: 0, printed: '秋鹿 古酒', nameAsPrinted: '秋鹿', styles: ['koshu'] }] }),
        row({ brandId: 5, nameRomaji: 'Kenbishi', lines: [{ index: 1, printed: '剣菱 樽酒', nameAsPrinted: '剣菱', styles: ['taruzake'] }] }),
        row({ brandId: 6, nameRomaji: 'Jikon', lines: [{ index: 2, printed: '而今 生 原酒', nameAsPrinted: '而今', styles: ['nama', 'genshu'] }] }),
      ],
    })
    const [koshu, taruzake] = screen.getAllByTestId('list-row-less-usual')
    expect(screen.getAllByTestId('list-row-less-usual')).toHaveLength(2)
    expect(koshu.textContent).toBe('Less usual · Koshu (古酒), aged sake')
    // Koshu has a Learn entry; taruzake does not yet (open decision 15).
    expect(koshu.tagName).toBe('A')
    expect(koshu.getAttribute('href')).toContain('/learn/koshu')
    expect(taruzake.tagName).toBe('P')
  })
})
