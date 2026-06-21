import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HeuristicDisclaimerView } from './heuristic-disclaimer'

const baseProps = {
  title: 'These are cross-beverage approximations',
  body: 'Western descriptors like “smoky” or “tannic” don’t have a direct sake equivalent.',
} as const

describe('HeuristicDisclaimerView', () => {
  it('renders the disclaimer copy visibly so a visitor sees the caveat without hovering', () => {
    render(<HeuristicDisclaimerView {...baseProps} />)
    // The contract: this is an ALWAYS-VISIBLE disclaimer. CLAUDE.md
    // requires that cross-beverage results carry the caveat next to
    // them, not inside a tooltip on the badge. Assert both the title
    // and body land in the DOM as readable text.
    expect(screen.getByTestId('heuristic-disclaimer-title').textContent).toBe(
      baseProps.title,
    )
    expect(screen.getByTestId('heuristic-disclaimer-body').textContent).toBe(
      baseProps.body,
    )
  })

  it('uses role="note" so screen readers announce it as a parenthetical to the surrounding results', () => {
    render(<HeuristicDisclaimerView {...baseProps} />)
    const root = screen.getByTestId('heuristic-disclaimer')
    expect(root.getAttribute('role')).toBe('note')
  })

  it('renders the German copy when the locale wrapper supplies it', () => {
    render(
      <HeuristicDisclaimerView
        title="Diese Ergebnisse sind Näherungen aus anderen Getränken"
        body="Westliche Begriffe wie „rauchig“ oder „gerbstoffreich“ haben keine direkte Entsprechung im Sake."
      />,
    )
    expect(screen.getByTestId('heuristic-disclaimer-title').textContent).toBe(
      'Diese Ergebnisse sind Näherungen aus anderen Getränken',
    )
    expect(screen.getByTestId('heuristic-disclaimer-body').textContent).toContain(
      'rauchig',
    )
  })
})
