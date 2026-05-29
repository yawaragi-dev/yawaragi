import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { FlavorAxisLabelView } from './flavor-axis-label'

const baseProps = {
  axis: 'f1' as const,
  romaji: 'hanayaka',
  kanji: '華やか',
  approximation: 'fragrant / floral',
  caveat: "Not 'perfumed' — aromatic-ester-driven. Brewer's term; the English label is an approximation.",
}

describe('FlavorAxisLabelView', () => {
  it('renders romaji and kanji as visible DOM text', () => {
    render(<FlavorAxisLabelView {...baseProps} />)

    expect(screen.getByTestId('flavor-axis-f1-romaji').textContent).toBe('hanayaka')
    const kanji = screen.getByTestId('flavor-axis-f1-kanji')
    expect(kanji.textContent).toBe('華やか')
    expect(kanji.getAttribute('lang')).toBe('ja')
  })

  it('exposes the approximation + caveat to assistive tech via aria-describedby', () => {
    render(<FlavorAxisLabelView {...baseProps} />)

    const root = screen.getByTestId('flavor-axis-f1')
    const tooltipId = root.getAttribute('aria-describedby')
    expect(tooltipId).toBe('flavor-axis-f1-tooltip')

    const tooltip = document.getElementById(tooltipId!)
    expect(tooltip).not.toBeNull()
    expect(tooltip!.getAttribute('role')).toBe('tooltip')
    expect(within(tooltip!).getByText('fragrant / floral')).toBeTruthy()
    expect(within(tooltip!).getByText(/Not 'perfumed' — aromatic-ester-driven/)).toBeTruthy()
  })

  it('shows per-axis caveat content (not a shared generic message)', () => {
    // CONTEXT.md's vocab table carries distinct "not X" caveats per axis
    // (f2 "not creamy", f3 "not tannic", etc.) — confirm the prop is
    // surfaced verbatim and not collapsed into a shared placeholder.
    render(
      <FlavorAxisLabelView
        {...baseProps}
        axis="f3"
        romaji="juko"
        kanji="重厚"
        approximation="heavy / full-bodied"
        caveat="Not 'tannic' — weight + amino acid. Brewer's term; the English label is an approximation."
      />,
    )
    const tooltip = screen.getByTestId('flavor-axis-f3-tooltip')
    expect(tooltip.textContent).toContain("Not 'tannic'")
    expect(tooltip.textContent).toContain('amino acid')
  })

  it('is keyboard-reachable so the tooltip can fire on focus', () => {
    render(<FlavorAxisLabelView {...baseProps} />)
    expect(screen.getByTestId('flavor-axis-f1').getAttribute('tabindex')).toBe('0')
  })

  it('keys the tooltip id by axis so multiple labels coexist on one page', () => {
    const { rerender } = render(<FlavorAxisLabelView {...baseProps} />)
    expect(screen.getByTestId('flavor-axis-f1').getAttribute('aria-describedby')).toBe(
      'flavor-axis-f1-tooltip',
    )

    rerender(
      <FlavorAxisLabelView
        {...baseProps}
        axis="f6"
        romaji="keikai"
        kanji="軽快"
        approximation="light / crisp"
      />,
    )
    expect(screen.getByTestId('flavor-axis-f6').getAttribute('aria-describedby')).toBe(
      'flavor-axis-f6-tooltip',
    )
  })

  it('renders the German approximation when the locale wrapper supplies it', () => {
    render(
      <FlavorAxisLabelView
        {...baseProps}
        approximation="duftig / blumig"
        caveat="Nicht 'parfümiert' — aromatische Ester. Brauer-Begriff; die deutsche Bezeichnung ist eine Annäherung."
      />,
    )

    const tooltip = screen.getByTestId('flavor-axis-f1-tooltip')
    expect(tooltip.textContent).toContain('duftig / blumig')
    expect(tooltip.textContent).toContain('Brauer-Begriff')
  })
})
