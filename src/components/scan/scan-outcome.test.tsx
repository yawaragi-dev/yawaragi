import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import en from '~/messages/en.json'
import { ScanOutcome } from './scan-outcome'

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
})
