import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ProvenanceBadge, ProvenanceBadgeView } from './provenance-badge'

const baseViewProps = {
  label: 'AI-extracted',
  explanation: 'This value was read from an image or document by an AI model.',
  sheetTitle: 'Read by an AI model',
  closeLabel: 'Close',
  id: 'test-badge',
} as const

describe('ProvenanceBadgeView', () => {
  it('shows the source-kind label so the user sees why the value is flagged', () => {
    render(<ProvenanceBadgeView kind="llmExtracted" {...baseViewProps} />)
    expect(screen.getByTestId('provenance-badge-label').textContent).toBe(
      'AI-extracted',
    )
  })

  it('exposes the explanation via aria-describedby so screen readers reach it with no interaction', () => {
    render(<ProvenanceBadgeView kind="llmExtracted" {...baseViewProps} />)
    const root = screen.getByTestId('provenance-badge')

    // The id itself is deliberately NOT asserted. The previous version of this
    // test pinned the literal string `provenance-badge-llmExtracted-tooltip`,
    // which encoded a bug: that id is per-KIND, so two badges of the same kind
    // on one screen — the sake page has exactly that, one on the brand romaji
    // and one on the brewery romaji — emitted duplicate ids and
    // `aria-describedby` resolved to whichever came first. What matters is
    // that the reference resolves to an element carrying the explanation.
    const describedBy = root.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    const description = document.getElementById(describedBy!)
    expect(description).not.toBeNull()
    expect(description!.textContent).toBe(baseViewProps.explanation)
  })

  it('gives two badges of the same kind different description ids', () => {
    // The collision the old per-kind id produced. `aria-describedby` pointing
    // at a duplicated id makes the second badge describe the first one's text.
    render(
      <>
        <ProvenanceBadgeView kind="llmInferred" {...baseViewProps} id="brand-romaji" />
        <ProvenanceBadgeView kind="llmInferred" {...baseViewProps} id="brewery-romaji" />
      </>,
    )

    const [first, second] = screen.getAllByTestId('provenance-badge')
    const firstId = first.getAttribute('aria-describedby')
    const secondId = second.getAttribute('aria-describedby')

    expect(firstId).not.toBe(secondId)
    expect(document.querySelectorAll(`#${firstId}`)).toHaveLength(1)
    expect(document.querySelectorAll(`#${secondId}`)).toHaveLength(1)
  })

  it('is a real button, so the explanation is reachable by tap and keyboard alike', () => {
    // It used to be a focusable `<span>` with a hover tooltip. The tooltip was
    // `absolute left-0 w-max` and ran off-screen for any badge right of
    // centre — reported as text cut mid-sentence. §16's sheet is
    // viewport-sized, so it cannot be clipped, and CLAUDE.md names that
    // pattern the canonical one "for every inferred claim".
    render(<ProvenanceBadgeView kind="llmExtracted" {...baseViewProps} />)
    const root = screen.getByTestId('provenance-badge')

    expect(root.tagName).toBe('BUTTON')
    // No tooltip element left to overflow.
    expect(screen.queryByTestId('provenance-badge-tooltip')).toBeNull()
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
        explanation="Dieser Wert wurde von einem KI-Modell abgelesen."
        sheetTitle="Von einem KI-Modell abgelesen"
        closeLabel="Schließen"
        id="de-badge"
      />,
    )
    expect(screen.getByTestId('provenance-badge-label').textContent).toBe('KI-erkannt')
    expect(screen.getByTestId('provenance-badge-description').textContent).toBe(
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
    // `id` is required now — badges must be unique per instance — but it is
    // irrelevant to this contract: the policy decides before any id is used.
    expect(await ProvenanceBadge({ source: 'sakenowa', id: 'x' })).toBeNull()
    expect(await ProvenanceBadge({ source: 'sakenowa_inferred', id: 'x' })).toBeNull()
    expect(await ProvenanceBadge({ source: 'user_corrected', id: 'x' })).toBeNull()
    expect(await ProvenanceBadge({ source: 'manual_curation', id: 'x' })).toBeNull()
  })
})
