import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SakenowaAttributionView } from './sakenowa-attribution'

const baseProps = {
  poweredBy: 'Powered by Sakenowa',
  linkLabel: 'Visit Sakenowa',
}

describe('SakenowaAttributionView', () => {
  describe('above-fold variant', () => {
    it('renders the canonical "Powered by Sakenowa" phrase prominently', () => {
      render(<SakenowaAttributionView placement="above-fold" {...baseProps} />)
      const root = screen.getByTestId('sakenowa-attribution-above-fold')
      expect(root.textContent).toContain('Powered by Sakenowa')
    })

    it('links to sakenowa.com so the attribution licence is satisfied', () => {
      render(<SakenowaAttributionView placement="above-fold" {...baseProps} />)
      const link = screen.getByRole('link', { name: 'Visit Sakenowa' })
      expect(link.getAttribute('href')).toBe('https://sakenowa.com')
    })

    it("opens the external link in a new tab without leaking opener context", () => {
      // target=_blank without rel=noopener is a known security leak; assert
      // both attributes are present so a future Tailwind refactor can't
      // accidentally drop them.
      render(<SakenowaAttributionView placement="above-fold" {...baseProps} />)
      const link = screen.getByRole('link', { name: 'Visit Sakenowa' })
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    })
  })

  describe('inline variant', () => {
    it('renders the canonical "Powered by Sakenowa" phrase', () => {
      render(<SakenowaAttributionView placement="inline" {...baseProps} />)
      const root = screen.getByTestId('sakenowa-attribution-inline')
      expect(root.textContent).toContain('Powered by Sakenowa')
    })

    it('links to sakenowa.com so the attribution licence is satisfied', () => {
      render(<SakenowaAttributionView placement="inline" {...baseProps} />)
      const link = screen.getByRole('link', { name: 'Visit Sakenowa' })
      expect(link.getAttribute('href')).toBe('https://sakenowa.com')
    })

    it("opens the external link in a new tab without leaking opener context", () => {
      render(<SakenowaAttributionView placement="inline" {...baseProps} />)
      const link = screen.getByRole('link', { name: 'Visit Sakenowa' })
      expect(link.getAttribute('target')).toBe('_blank')
      expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    })
  })

  it('renders the German attribution copy when the locale wrapper supplies it', () => {
    // The proper noun "Sakenowa" is preserved verbatim across locales —
    // assert the German phrasing still surfaces it and links to the same URL.
    render(
      <SakenowaAttributionView
        placement="above-fold"
        poweredBy="Bereitgestellt mit Daten von Sakenowa"
        linkLabel="Sakenowa besuchen"
      />,
    )
    const root = screen.getByTestId('sakenowa-attribution-above-fold')
    expect(root.textContent).toContain('Bereitgestellt mit Daten von Sakenowa')
    const link = screen.getByRole('link', { name: 'Sakenowa besuchen' })
    expect(link.getAttribute('href')).toBe('https://sakenowa.com')
  })
})
