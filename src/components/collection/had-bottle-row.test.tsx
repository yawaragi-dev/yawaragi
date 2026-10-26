import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import en from '~/messages/en.json'

const forgetBottleHad = vi.fn()
vi.mock('@/lib/collection/bottle-history-actions', () => ({
  forgetBottleHad: (...a: unknown[]) => forgetBottleHad(...a),
}))

const { HadBottleRow } = await import('./had-bottle-row')

const onRowLinkClick = vi.fn()

function renderRow(readOnly = false) {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <ul>
        <HadBottleRow bottleId="e1#0" name="Sharaku" readOnly={readOnly}>
          <button type="button" onClick={onRowLinkClick}>
            Sharaku
          </button>
        </HadBottleRow>
      </ul>
    </NextIntlClientProvider>,
  )
}

const row = () => screen.getByTestId('bottles-had-swipe')
const question = () => screen.queryByTestId('bottles-had-confirm')

function swipe(dx: number, dy = 0) {
  fireEvent.pointerDown(row(), { pointerId: 1, pointerType: 'touch', clientX: 200, clientY: 100 })
  fireEvent.pointerMove(row(), { pointerId: 1, pointerType: 'touch', clientX: 200 + dx / 2, clientY: 100 + dy / 2 })
  fireEvent.pointerMove(row(), { pointerId: 1, pointerType: 'touch', clientX: 200 + dx, clientY: 100 + dy })
  fireEvent.pointerUp(row(), { pointerId: 1, pointerType: 'touch', clientX: 200 + dx, clientY: 100 + dy })
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('a row of bottles you have had', () => {
  it('asks before removing when the row is swiped to the left, and removes nothing yet', () => {
    renderRow()
    swipe(-120)

    expect(question()?.textContent).toContain('Take Sharaku off this list?')
    expect(forgetBottleHad).not.toHaveBeenCalled()
  })

  it('does not open the bottle page at the end of a swipe', () => {
    renderRow()
    swipe(-120)
    fireEvent.click(screen.getByText('Sharaku', { selector: 'button' }))

    expect(onRowLinkClick).not.toHaveBeenCalled()
  })

  it('opens the bottle page on the next tap when the swipe sent no click of its own', () => {
    renderRow()
    swipe(-40)
    const link = screen.getByText('Sharaku', { selector: 'button' })
    fireEvent.pointerDown(link, { pointerId: 2, pointerType: 'touch', clientX: 50, clientY: 100 })
    fireEvent.pointerUp(link, { pointerId: 2, pointerType: 'touch', clientX: 50, clientY: 100 })
    fireEvent.click(link)

    expect(onRowLinkClick).toHaveBeenCalledTimes(1)
  })

  it('still opens the bottle page on a plain tap', () => {
    renderRow()
    fireEvent.click(screen.getByText('Sharaku', { selector: 'button' }))

    expect(onRowLinkClick).toHaveBeenCalledTimes(1)
  })

  it('ignores a short nudge and a vertical scroll', () => {
    renderRow()
    swipe(-30)
    swipe(-20, 160)

    expect(question()).toBeNull()
  })

  it('ignores a swipe to the right', () => {
    renderRow()
    swipe(120)

    expect(question()).toBeNull()
  })

  it('does nothing on a swipe in the sample collection', () => {
    renderRow(true)
    swipe(-120)

    expect(question()).toBeNull()
  })
})
