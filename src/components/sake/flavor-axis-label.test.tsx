import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { FlavorAxisLabelView } from './flavor-axis-label'

/**
 * These tests were rewritten wholesale by ADR-0022. The previous six pinned
 * inline romaji + kanji and a per-axis tooltip, which was the right contract
 * under the old "never English-only" rule and is the wrong one now.
 *
 * Deleting an assertion because it went red is usually how a guarantee gets
 * lost, so it is worth being explicit about where each one went: the whole
 * brewers'-term guarantee moved to `<FlavorTermsSheet />`, and the tests that
 * enforce it now live in `flavor-terms-sheet.test.tsx` (the sheet names all
 * six) and `flavor-profile-view.test.tsx` (every chart mounts one). Nothing
 * is merely dropped.
 */
describe('FlavorAxisLabelView', () => {
  it('shows the reader the locale word for the axis', () => {
    render(<FlavorAxisLabelView axis="f1" approximation="Floral" />)

    expect(screen.getByTestId('flavor-axis-f1').textContent).toBe('Floral')
  })

  it('carries the id each axis bar points its accessible name at', () => {
    // `<Bar />` sets aria-labelledby="flavor-axis-<axis>-label". If this id
    // moves, all six progressbars silently lose their names — the failure is
    // invisible in the rendered page and only an AT user would hit it.
    render(<FlavorAxisLabelView axis="f4" approximation="Mild" />)

    expect(screen.getByTestId('flavor-axis-f4').id).toBe('flavor-axis-f4-label')
  })

  it('keys that id by axis so six labels coexist on one chart', () => {
    const { rerender } = render(<FlavorAxisLabelView axis="f1" approximation="Floral" />)
    expect(screen.getByTestId('flavor-axis-f1').id).toBe('flavor-axis-f1-label')

    rerender(<FlavorAxisLabelView axis="f6" approximation="Light" />)
    expect(screen.getByTestId('flavor-axis-f6').id).toBe('flavor-axis-f6-label')
  })

  it('renders the German word when the locale wrapper supplies it', () => {
    render(<FlavorAxisLabelView axis="f1" approximation="Blumig" />)

    expect(screen.getByTestId('flavor-axis-f1').textContent).toBe('Blumig')
  })

  it('no longer claims a description it does not carry', () => {
    // The old label advertised aria-describedby pointing at a per-axis
    // tooltip. A leftover attribute pointing at an element that no longer
    // exists is worse than none: AT resolves it to nothing and the reader
    // gets silence where the caveat used to be.
    const { container } = render(<FlavorAxisLabelView axis="f1" approximation="Floral" />)

    expect(container.querySelector('[aria-describedby]')).toBeNull()
    expect(container.querySelector('[role="tooltip"]')).toBeNull()
  })
})
