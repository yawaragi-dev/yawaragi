import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { FLAVOR_AXES, FLAVOR_AXIS_ROMAJI } from '@/lib/schemas/flavor-chart'
import type { FlavorAxisStrings } from './flavor-profile-view'
import { FlavorTermsSheet } from './flavor-terms-sheet'

/**
 * This sheet is the whole justification for ADR-0022. If it stops naming the
 * Japanese terms, the app is rendering "Floral" and "Rich" as if they were
 * translations — which is the thing the superseded rule existed to prevent.
 */

const EN: Record<string, { approximation: string; kanji: string; caveat: string }> = {
  f1: { approximation: 'Floral', kanji: '華やか', caveat: 'Showy, aromatic.' },
  f2: { approximation: 'Mellow', kanji: '芳醇', caveat: 'Umami-and-aroma depth.' },
  f3: { approximation: 'Rich', kanji: '重厚', caveat: 'Weight plus amino acid.' },
  f4: { approximation: 'Mild', kanji: '穏やか', caveat: 'Restrained aroma.' },
  f5: { approximation: 'Dry', kanji: 'ドライ', caveat: 'Tracks SMV broadly.' },
  f6: { approximation: 'Light', kanji: '軽快', caveat: 'Refreshing finish.' },
}

const strings = {
  caveat: "Brewers' terms, translated loosely.",
  triggerLabel: 'About these flavor words',
  title: 'About these flavor words',
  intro:
    "These six are Japanese brewers' terms. The English words are approximations, not translations.",
  closeLabel: 'Close',
}

function renderSheet() {
  return render(
    <FlavorTermsSheet
      strings={strings}
      axisStrings={EN as Record<string, FlavorAxisStrings>}
      instanceId="x"
    />,
  )
}

async function openSheet() {
  fireEvent.click(screen.getByTestId('info-sheet-flavor-terms-x-trigger'))
  await waitFor(() => expect(screen.getByTestId('flavor-terms-list')).toBeTruthy())
}

describe('FlavorTermsSheet', () => {
  it('shows the caveat without anyone opening anything', () => {
    // The sheet body is portalled and unmounted until opened, so the caveat
    // line is the only part a screen reader can reach passively. It is also
    // what the trigger's aria-describedby resolves to.
    renderSheet()

    const caveat = screen.getByTestId('info-sheet-flavor-terms-x-caveat')
    expect(caveat.textContent).toBe("Brewers' terms, translated loosely.")
    expect(
      screen.getByTestId('info-sheet-flavor-terms-x-trigger').getAttribute('aria-describedby'),
    ).toBe(caveat.id)
  })

  it('names every one of the six brewers terms once opened', async () => {
    renderSheet()
    await openSheet()

    for (const axis of FLAVOR_AXES) {
      const row = screen.getByTestId(`flavor-term-${axis}`)
      expect(row.textContent).toContain(EN[axis].approximation)
      expect(row.textContent).toContain(EN[axis].kanji)
      expect(row.textContent).toContain(FLAVOR_AXIS_ROMAJI[axis])
    }
  })

  it('marks the Japanese as Japanese for screen readers and font selection', async () => {
    renderSheet()
    await openSheet()

    const kanji = screen
      .getByTestId('flavor-term-f1')
      .querySelector('[lang="ja"]')
    expect(kanji?.textContent).toBe('華やか')
  })

  it('states that the English words are approximations, not translations', async () => {
    // The list alone would let a reader assume "Floral" IS 華やか. The intro
    // is the sentence that does the actual disclosing, so it is not
    // decorative prose and is asserted on its meaning, not its presence.
    renderSheet()
    await openSheet()

    expect(screen.getByText(/approximations, not translations/i)).toBeTruthy()
  })

  it('keeps the six rows in Sakenowa axis order', async () => {
    // Design v1.4 §17: f1..f6 is canonical everywhere. A chart ordered one
    // way and a glossary ordered another makes the sheet useless for looking
    // a word up while reading the bars.
    renderSheet()
    await openSheet()

    const rendered = Array.from(
      screen.getByTestId('flavor-terms-list').querySelectorAll('[data-testid^="flavor-term-"]'),
    ).map((el) => el.getAttribute('data-testid'))

    expect(rendered).toEqual(FLAVOR_AXES.map((a) => `flavor-term-${a}`))
  })
})
