import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it } from 'vitest'
import en from '~/messages/en.json'
import { ScanResultCard, type ScanResultCardProps } from './scan-result-card'

function renderCard(props: Partial<ScanResultCardProps> = {}) {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <ScanResultCard
        photoUrl={null}
        photoAlt="Your photo"
        sakeKanji="李白"
        sakeRomaji="Rihaku"
        breweryKanji="李白酒造"
        breweryRomaji="Rihaku Shuzō"
        sakeHref="/en/sake/846?from=scan"
        flavorChart={null}
        extractionConfidence={0.9}
        {...props}
      />
    </NextIntlClientProvider>,
  )
}

describe('§5 result card — what the label says beyond the sake', () => {
  it('shows what the label says about this bottling, marked as read by AI', () => {
    renderCard({
      readBottling: { product_name: '雄町', grade: 'junmai_ginjo', styles: ['nama', 'genshu', 'muroka'], polishing_ratio: 50 },
    })
    const block = screen.getByTestId('scan-result-on-this-label')
    expect(block.textContent).toContain('On this label')
    // Up to two styles, as on the suggested bottling name.
    expect(screen.getByTestId('scan-result-on-this-label-text').textContent).toBe(
      '雄町 · Junmai Ginjō · Nama · Genshu · 50% polished',
    )
    expect(block.querySelector('[data-kind="llmExtracted"]')).not.toBeNull()
  })

  it('has no such block when the label names the sake and nothing more', () => {
    renderCard({ readBottling: {} })
    expect(screen.queryByTestId('scan-result-on-this-label')).toBeNull()
  })

  it('says when the brewery came from the catalogue, not the label, and explains why', async () => {
    renderCard({ breweryPrinted: false })
    fireEvent.click(screen.getByTestId('scan-result-brewery-not-on-label'))
    expect(await screen.findByText(/The label printed the name alone/)).toBeTruthy()
    // The match itself is not downgraded.
    expect(screen.getByTestId('scan-result-match-tag').textContent).toBe('Sure match')
  })

  it('opened on the visitor\'s own bottling, names it, links its line and shows its tags instead of a match tag', () => {
    renderCard({
      sakeRomaji: 'Rihaku Omachi (雄町) Junmai Ginjō Nama',
      bottlingOf: { line: 'Rihaku', lineKanji: '李白', href: '/en/sake/846?from=scan', tags: ['Junmai Ginjō', 'Nama'] },
    })
    expect(screen.getByTestId('scan-result-name-romaji').textContent).toBe('Rihaku Omachi (雄町) Junmai Ginjō Nama')
    const link = screen.getByTestId('scan-result-bottling-of')
    expect(link.textContent).toContain('A bottling of Rihaku')
    expect(link.getAttribute('href')).toBe('/en/sake/846?from=scan')
    expect(screen.getByTestId('scan-result-bottling-tags').textContent).toBe('Junmai GinjōNama')
    expect(screen.queryByTestId('scan-result-match-tag')).toBeNull()
  })

  it('says nothing about the brewery when the label printed it', () => {
    renderCard({ breweryPrinted: true })
    expect(screen.queryByTestId('scan-result-brewery-not-on-label')).toBeNull()
  })
})
