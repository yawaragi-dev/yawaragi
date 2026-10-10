import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import en from '~/messages/en.json'

const addOwnBottling = vi.fn()
vi.mock('@/lib/collection/expression-actions', () => ({
  addOwnBottling: (...a: unknown[]) => addOwnBottling(...a),
}))

const { ScanOutcome } = await import('./scan-outcome')

function renderOutcome(props: Partial<Parameters<typeof ScanOutcome>[0]> = {}) {
  const onRescan = vi.fn()
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <ScanOutcome
        testId="scan-result-no-match"
        icon={null}
        kicker="Not in the catalogue"
        title="We read it, but can’t find it"
        body="Fix anything we misread."
        onRescan={onRescan}
        {...props}
      />
    </NextIntlClientProvider>,
  )
  return { onRescan }
}

describe('§5a — a scan outcome that is not a match', () => {
  it('says what happened, offers the rescan in its bar, and typing the name as the way out', () => {
    const { onRescan } = renderOutcome()
    expect(screen.getByTestId('scan-outcome-kicker').textContent).toBe('Not in the catalogue')
    expect(screen.getByRole('heading', { name: 'We read it, but can’t find it' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Scan again' }))
    expect(onRescan).toHaveBeenCalledOnce()
    expect(screen.getByRole('link', { name: 'Type the name instead' }).getAttribute('href')).toBe('/en/search')
  })

  it('lets the visitor fix what was read and search again with it', () => {
    renderOutcome({ read: { name: 'SAWA NO HANA Kokoro', brewery: '友野酒造', badge: null } })
    const name = screen.getByTestId('scan-outcome-read-name') as HTMLInputElement
    expect(name.value).toBe('SAWA NO HANA Kokoro')
    fireEvent.change(name, { target: { value: 'Sawa no Hana' } })
    expect(name.value).toBe('Sawa no Hana')
    expect(screen.getByRole('link', { name: 'Search again' }).getAttribute('href')).toBe('/en/search?q=Sawa+no+Hana')
    // No confidence on this screen — it lives in the Read by AI sheet.
    expect(screen.getByTestId('scan-outcome-read').textContent).not.toMatch(/%/)
  })

  it('shows candidates as guesses — a reason in words, no percentage, at most three', () => {
    const rows = [1, 2, 3, 4].map((n) => ({
      key: n,
      href: `/en/sake/${n}?from=scan`,
      name: `Sake ${n}`,
      kanji: null,
      where: 'Brewery · Place',
      reason: 'Same brewery · closest name',
    }))
    renderOutcome({ candidates: { label: 'Did you mean', rows } })
    const list = screen.getByTestId('scan-outcome-candidates')
    expect(list.querySelectorAll('a')).toHaveLength(3)
    expect(list.textContent).toContain('Same brewery · closest name')
    expect(list.textContent).not.toMatch(/%/)
  })

  it('offers to keep an unmatched bottle anyway, with the name and brewery as the visitor fixed them', async () => {
    addOwnBottling.mockResolvedValue({ status: 'ok', expressionId: 'x9' })
    renderOutcome({
      canKeep: true,
      read: { name: 'SAWA NO HANA Kokoro', brewery: '友野酒造', badge: null },
    })
    const keep = screen.getByTestId('scan-outcome-keep')
    expect(keep.textContent).toContain('Keep it anyway')
    expect(keep.textContent).toContain('marked as your own entry')

    fireEvent.change(screen.getByTestId('scan-outcome-read-name'), { target: { value: '澤の花' } })
    fireEvent.change(screen.getByTestId('scan-outcome-read-brewery'), { target: { value: '伴野酒造' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add this bottling' }))

    await waitFor(() =>
      expect(addOwnBottling).toHaveBeenCalledWith({ brandId: null, name: '澤の花', brewery: '伴野酒造' }),
    )
  })

  it('does not offer to keep a bottle to a visitor who cannot keep a journal, or when nothing was read', () => {
    renderOutcome({ read: { name: '澤の花', brewery: '伴野酒造', badge: null } })
    expect(screen.queryByTestId('scan-outcome-keep')).toBeNull()
  })

  it('has nothing to keep without a name', () => {
    renderOutcome({ canKeep: true, read: { name: '', brewery: '伴野酒造', badge: null } })
    expect((screen.getByRole('button', { name: 'Add this bottling' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
