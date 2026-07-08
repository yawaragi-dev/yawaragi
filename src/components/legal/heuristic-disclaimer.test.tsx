import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HeuristicDisclaimerView } from './heuristic-disclaimer'

const baseProps = {
  title: 'These are cross-beverage approximations',
  body: 'Western descriptors like “smoky” or “tannic” don’t have a direct sake equivalent.',
} as const

describe('HeuristicDisclaimerView', () => {
  it('shows the title as a visible caveat cue next to the result (UX-F #167)', () => {
    render(<HeuristicDisclaimerView {...baseProps} />)
    // The title stays visible so every cross-beverage result carries the
    // "these are approximations" caveat without any interaction — the
    // CLAUDE.md mandate. The longer body tucks into a tooltip (next test).
    expect(screen.getByTestId('heuristic-disclaimer-title').textContent).toBe(
      baseProps.title,
    )
  })

  it('keeps the full body in the DOM, wired to the info button via aria-describedby', () => {
    render(<HeuristicDisclaimerView {...baseProps} />)
    // Compliance contract after the density pass: the body moved into a
    // tooltip, but must stay screen-reader reachable — including the JMStV
    // discovery-framing sentence. Assert the body text is present, is a
    // `role="tooltip"`, AND that the info button describes itself with it,
    // so AT announces the caveat when the button is reached (no hover).
    const bodyEl = screen.getByTestId('heuristic-disclaimer-body')
    expect(bodyEl.textContent).toBe(baseProps.body)
    expect(bodyEl.getAttribute('role')).toBe('tooltip')

    const infoButton = screen.getByRole('button', { name: baseProps.title })
    expect(infoButton.getAttribute('aria-describedby')).toBe(bodyEl.id)
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
