import { fireEvent, render, screen, within } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it } from 'vitest'
import en from '~/messages/en.json'
import { pairingRow } from '@/lib/pairing/pairing-table'
import type { Pairing } from '@/lib/pairing/resolve-pairing'
import { CellarDishPick, type DishPickRow } from './cellar-dish-pick'

const style = (id: Parameters<typeof pairingRow>[0]): Pairing => ({ row: pairingRow(id), basis: 'style', source: 'manual_curation' })

/** The cellar's own order: an open bottle to finish soon, another open one, then sealed ones. */
const ROWS: DishPickRow[] = [
  { key: 'open-soon-rich', head: <span>Daishichi</span>, tail: <span>Open 12 days</span>, pairing: { row: pairingRow('junshu'), basis: 'chart', source: 'sakenowa_inferred' } },
  { key: 'open-nama', head: <span>Shintotsukawa Nama</span>, tail: <span>Open 2 days</span>, pairing: style('soshu') },
  { key: 'sealed-unknown', head: <span>Denshu</span>, tail: <span>Unopened</span>, pairing: null },
  { key: 'sealed-ginjo', head: <span>Dassai 45</span>, tail: <span>Unopened</span>, pairing: { row: pairingRow('kunshu'), basis: 'grade', grade: 'junmai_daiginjo', source: 'manual_curation' } },
]

function renderPick(initialDish: Parameters<typeof CellarDishPick>[0]['initialDish'] = null) {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <CellarDishPick rows={ROWS} summary="5 bottles · 2 open" initialDish={initialDish} />
    </NextIntlClientProvider>,
  )
}

const order = () => screen.getAllByTestId('cellar-row').map((row) => row.getAttribute('data-row-key'))
const states = () => screen.getAllByTestId('cellar-row').map((row) => row.getAttribute('data-dish'))
const chip = (name: string) => screen.getByRole('button', { name })

beforeEach(() => {
  window.history.replaceState(null, '', '/en/collection?tab=cellar')
})

describe('picking a bottle from the cellar for a dish', () => {
  it('shows the cellar in its own order, with the dishes one tap away', () => {
    renderPick()
    expect(order()).toEqual(['open-soon-rich', 'open-nama', 'sealed-unknown', 'sealed-ginjo'])
    expect(screen.queryByRole('group', { name: 'What’s on the table?' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Pick for a dish' }))
    const chips = within(screen.getByRole('group', { name: 'What’s on the table?' })).getAllByRole('button')
    expect(chips).toHaveLength(9)
    expect(screen.getByTestId('dish-pick-status').textContent).toContain('Choose a dish')
    // Opening the strip alone re-sorts nothing.
    expect(order()).toEqual(['open-soon-rich', 'open-nama', 'sealed-unknown', 'sealed-ginjo'])
  })

  it('moves the bottles that go with the dish to the top, saying what with and what placed them', () => {
    renderPick()
    fireEvent.click(screen.getByRole('button', { name: 'Pick for a dish' }))
    fireEvent.click(chip('Raw fish and shellfish'))

    expect(chip('Raw fish and shellfish').getAttribute('aria-pressed')).toBe('true')
    // Matches keep the cellar's order: the open bottle before the sealed one.
    expect(order()).toEqual(['open-nama', 'sealed-ginjo', 'open-soon-rich', 'sealed-unknown'])
    expect(states()).toEqual(['match', 'match', 'other', 'unplaceable'])
    expect(screen.getByTestId('dish-pick-status').textContent).toContain('2 bottles often served with this')

    const [nama, ginjo] = screen.getAllByTestId('cellar-row')
    expect(within(nama).getByTestId('dish-pick-food').textContent).toContain('Often served with: Raw oysters')
    expect(within(nama).getByTestId('dish-pick-basis').textContent).toContain('By its style · for soshu')
    expect(within(ginjo).getByTestId('dish-pick-basis').textContent).toContain('Junmai Daiginjō is usually fragrant')

    const [, , rich, unknown] = screen.getAllByTestId('cellar-row')
    expect(within(rich).getByTestId('dish-pick-why').textContent).toContain('For other dishes · junshu')
    expect(within(unknown).getByTestId('dish-pick-why').textContent).toContain('No pairing in our table')
  })

  it('says a match from the flavor chart came from Sakenowa', () => {
    renderPick('richMeat')
    const [rich] = screen.getAllByTestId('cellar-row')
    expect(rich.getAttribute('data-row-key')).toBe('open-soon-rich')
    expect(within(rich).getByTestId('dish-pick-basis').textContent).toContain('From the flavor chart (Sakenowa)')
    expect(within(rich).getByTestId('dish-pick-basis').getAttribute('data-source')).toBe('sakenowa_inferred')
  })

  it('puts the dish in the address, and takes it out again when the chip is tapped twice', () => {
    renderPick()
    fireEvent.click(screen.getByRole('button', { name: 'Pick for a dish' }))
    fireEvent.click(chip('Cheese'))
    expect(new URL(window.location.href).searchParams.get('dish')).toBe('cheese')
    expect(new URL(window.location.href).searchParams.get('tab')).toBe('cellar')

    fireEvent.click(chip('Cheese'))
    expect(chip('Cheese').getAttribute('aria-pressed')).toBe('false')
    expect(new URL(window.location.href).searchParams.has('dish')).toBe(false)
    expect(order()).toEqual(['open-soon-rich', 'open-nama', 'sealed-unknown', 'sealed-ginjo'])
  })

  it('"Clear" closes the strip and puts the cellar back in its own order', () => {
    renderPick('rawSeafood')
    expect(screen.queryByRole('group', { name: 'What’s on the table?' })).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.queryByRole('group', { name: 'What’s on the table?' })).toBeNull()
    expect(states()).toEqual(['plain', 'plain', 'plain', 'plain'])
    expect(new URL(window.location.href).searchParams.has('dish')).toBe(false)
  })

  it('when nothing matches, names the kinds that would — and still lists the whole cellar', () => {
    renderPick('spicy')
    expect(screen.getByTestId('dish-pick-none').textContent).toContain('Nothing in your cellar for this one')
    expect(screen.getByTestId('dish-pick-none').textContent).toContain('nigori')
    expect(screen.getAllByTestId('cellar-row')).toHaveLength(4)
  })

  it('carries a caveat whose sheet names only the sources for the kinds this dish reaches', async () => {
    renderPick('grilledEel')
    const trigger = screen.getByRole('button', { name: 'Where these pairings come from' })
    const caveat = document.getElementById(trigger.getAttribute('aria-describedby')!)
    expect(caveat?.textContent).toBe('From a hand-curated pairing table, by kind of sake. Bottlings vary.')
    fireEvent.click(trigger)
    const sheet = await screen.findByRole('dialog')
    const links = within(sheet).getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(links).toEqual(pairingRow('koshu').sources.map((s) => s.url))
  })
})
