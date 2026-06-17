import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import {
  SakenowaAttributionView,
  requiresSakenowaAttribution,
} from './sakenowa-attribution'

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

describe('requiresSakenowaAttribution', () => {
  // ADR-0014: a page mounts `<SakenowaAttribution />` iff at least one
  // rendered record's `source` is in the Sakenowa attribution set. The
  // predicate is the single decision point so future sources (NTA,
  // Wikidata, …) get sibling predicates without touching this one.
  it('returns true when the set contains "sakenowa"', () => {
    expect(requiresSakenowaAttribution(new Set(['sakenowa']))).toBe(true)
  })

  it('returns true when the set contains "sakenowa_inferred"', () => {
    expect(requiresSakenowaAttribution(new Set(['sakenowa_inferred']))).toBe(true)
  })

  it('returns true for an amalgam page where ONE rendered record is Sakenowa-sourced', () => {
    // The UMAMI case: brand=manual_curation, brewery=sakenowa,
    // flavor_chart absent. Attribution still required because the
    // rendered brewery info is Sakenowa data.
    expect(
      requiresSakenowaAttribution(new Set(['manual_curation', 'sakenowa'])),
    ).toBe(true)
  })

  it('returns false when no rendered record is Sakenowa-sourced', () => {
    // A hypothetical fully-manual sake (brand AND brewery both
    // `manual_curation`) — no attribution obligation triggers.
    expect(
      requiresSakenowaAttribution(new Set(['manual_curation', 'llm_extracted'])),
    ).toBe(false)
  })

  it('tolerates null / undefined entries in the iterable', () => {
    // Pages aggregate sources via `[brand.source, brewery?.source,
    // flavorChart?.source]` — null entries (missing brewery, no flavor
    // chart yet) must not throw and must not flip the result.
    expect(
      requiresSakenowaAttribution(['sakenowa', null, undefined]),
    ).toBe(true)
    expect(requiresSakenowaAttribution([null, undefined])).toBe(false)
  })

  it('returns false for an empty set', () => {
    expect(requiresSakenowaAttribution(new Set<string>())).toBe(false)
  })
})
