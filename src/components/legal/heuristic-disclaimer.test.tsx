import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HeuristicDisclaimerView } from './heuristic-disclaimer'

const baseProps = {
  title: 'These are cross-beverage approximations',
  body: 'Western descriptors like “smoky” or “tannic” don’t have a direct sake equivalent.',
} as const

describe('HeuristicDisclaimerView (card placement)', () => {
  it('renders the disclaimer copy visibly so a visitor sees the caveat without hovering', () => {
    render(<HeuristicDisclaimerView placement="card" {...baseProps} />)
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
    render(<HeuristicDisclaimerView placement="card" {...baseProps} />)
    const root = screen.getByTestId('heuristic-disclaimer-card')
    expect(root.getAttribute('role')).toBe('note')
  })

  it('renders the German copy when the locale wrapper supplies it', () => {
    render(
      <HeuristicDisclaimerView
        placement="card"
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

  it('exposes a data-placement attribute so future styling layers can branch on the variant', () => {
    render(<HeuristicDisclaimerView placement="card" {...baseProps} />)
    expect(
      screen.getByTestId('heuristic-disclaimer-card').getAttribute('data-placement'),
    ).toBe('card')
  })
})

describe('HeuristicDisclaimerView (inline placement)', () => {
  it('renders the body without the title so it fits in a card footer', () => {
    render(<HeuristicDisclaimerView placement="inline" {...baseProps} />)
    // The inline variant is intentionally terse — title would
    // dominate a card footer. Only the body should appear.
    expect(screen.getByTestId('heuristic-disclaimer-body').textContent).toBe(
      baseProps.body,
    )
    expect(screen.queryByTestId('heuristic-disclaimer-title')).toBeNull()
  })

  it('uses role="note" in the inline variant too', () => {
    render(<HeuristicDisclaimerView placement="inline" {...baseProps} />)
    expect(
      screen.getByTestId('heuristic-disclaimer-inline').getAttribute('role'),
    ).toBe('note')
  })

  it('exposes a data-placement attribute distinct from card', () => {
    render(<HeuristicDisclaimerView placement="inline" {...baseProps} />)
    expect(
      screen.getByTestId('heuristic-disclaimer-inline').getAttribute('data-placement'),
    ).toBe('inline')
  })
})
