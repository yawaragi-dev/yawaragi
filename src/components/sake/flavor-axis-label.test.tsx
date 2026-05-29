import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { FlavorAxisLabelView } from './flavor-axis-label'

const baseProps = {
  axis: 'f1' as const,
  romaji: 'hanayaka',
  kanji: '華やか',
  approximation: 'fragrant / floral',
  caveat: "This is a brewer's term; the English label is an approximation.",
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
    expect(
      within(tooltip!).getByText(/brewer's term; the English label is an approximation/),
    ).toBeTruthy()
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
        caveat="Dies ist ein Brauer-Begriff; die deutsche Bezeichnung ist eine Annäherung."
      />,
    )

    const tooltip = screen.getByTestId('flavor-axis-f1-tooltip')
    expect(tooltip.textContent).toContain('duftig / blumig')
    expect(tooltip.textContent).toContain('Brauer-Begriff')
  })
})
