import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProvenanceBadge, ProvenanceBadgeView } from './provenance-badge'

const baseViewProps = {
  label: 'AI-extracted',
  tooltip: 'This value was read from an image or document by an AI model.',
} as const

describe('ProvenanceBadgeView', () => {
  it('shows the source-kind label so the user sees why the value is flagged', () => {
    render(<ProvenanceBadgeView kind="llmExtracted" {...baseViewProps} />)
    expect(screen.getByTestId('provenance-badge-label').textContent).toBe(
      'AI-extracted',
    )
  })

  it('exposes the explanation via aria-describedby so screen readers reach it without hover', () => {
    render(<ProvenanceBadgeView kind="llmExtracted" {...baseViewProps} />)
    const root = screen.getByTestId('provenance-badge')
    const tooltipId = root.getAttribute('aria-describedby')
    expect(tooltipId).toBe('provenance-badge-llmExtracted-tooltip')
    const tooltip = document.getElementById(tooltipId!)
    expect(tooltip).not.toBeNull()
    expect(tooltip!.getAttribute('role')).toBe('tooltip')
    expect(tooltip!.textContent).toBe(baseViewProps.tooltip)
  })

  it('is keyboard-reachable so the tooltip can fire on focus', () => {
    render(<ProvenanceBadgeView kind="llmExtracted" {...baseViewProps} />)
    expect(screen.getByTestId('provenance-badge').getAttribute('tabindex')).toBe('0')
  })

  it('distinguishes the three badged kinds via a data-kind attribute so they are not visually identical', () => {
    // CLAUDE.md: "never blend sources silently" — the three badged
    // kinds must be tellable apart at a glance. The data-kind attribute
    // is the contract the styling hangs off; assert it explicitly so a
    // future refactor that drops the per-kind class can't silently make
    // the three look identical.
    const { rerender } = render(
      <ProvenanceBadgeView kind="llmExtracted" {...baseViewProps} />,
    )
    expect(screen.getByTestId('provenance-badge').getAttribute('data-kind')).toBe(
      'llmExtracted',
    )

    rerender(<ProvenanceBadgeView kind="llmInferred" {...baseViewProps} />)
    expect(screen.getByTestId('provenance-badge').getAttribute('data-kind')).toBe(
      'llmInferred',
    )

    rerender(<ProvenanceBadgeView kind="crossBeverageMap" {...baseViewProps} />)
    expect(screen.getByTestId('provenance-badge').getAttribute('data-kind')).toBe(
      'crossBeverageMap',
    )
  })

  it('renders no confidence indicator when the prop is omitted', () => {
    render(<ProvenanceBadgeView kind="llmExtracted" {...baseViewProps} />)
    expect(screen.queryByTestId('provenance-badge-confidence')).toBeNull()
  })

  it('renders a visible confidence percentage when the prop is supplied', () => {
    render(
      <ProvenanceBadgeView kind="llmExtracted" {...baseViewProps} confidence={0.83} />,
    )
    expect(screen.getByTestId('provenance-badge-confidence').textContent).toBe('83%')
  })

  it('clamps an out-of-range confidence so a sloppy upstream value never produces garbage UI', () => {
    const { rerender } = render(
      <ProvenanceBadgeView kind="llmExtracted" {...baseViewProps} confidence={1.5} />,
    )
    expect(screen.getByTestId('provenance-badge-confidence').textContent).toBe('100%')

    rerender(
      <ProvenanceBadgeView kind="llmExtracted" {...baseViewProps} confidence={-0.2} />,
    )
    expect(screen.getByTestId('provenance-badge-confidence').textContent).toBe('0%')
  })

  it('renders the German label when the locale wrapper supplies it', () => {
    render(
      <ProvenanceBadgeView
        kind="llmExtracted"
        label="KI-erkannt"
        tooltip="Dieser Wert wurde von einem KI-Modell abgelesen."
      />,
    )
    expect(screen.getByTestId('provenance-badge-label').textContent).toBe('KI-erkannt')
    expect(screen.getByTestId('provenance-badge-tooltip').textContent).toBe(
      'Dieser Wert wurde von einem KI-Modell abgelesen.',
    )
  })
})

// The async wrapper IS an RSC; Vitest can't render it. We can still
// directly assert the contract it carries for callers: it returns
// `null` for canonical sources so a page can always import it next to
// a value and let the policy decide whether anything renders. The four
// `null` cases (one per canonical source) are the brand-page contract
// in Phase 2.
describe('ProvenanceBadge (async wrapper)', () => {
  it('returns null for every canonical source so callers never need a conditional', async () => {
    expect(await ProvenanceBadge({ source: 'sakenowa' })).toBeNull()
    expect(await ProvenanceBadge({ source: 'sakenowa_inferred' })).toBeNull()
    expect(await ProvenanceBadge({ source: 'user_corrected' })).toBeNull()
    expect(await ProvenanceBadge({ source: 'manual_curation' })).toBeNull()
  })
})
