import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import en from '~/messages/en.json'

const rateNewTasting = vi.fn()
const updateTasting = vi.fn()
const undoTasting = vi.fn()
vi.mock('@/lib/taste/tasting-actions', () => ({
  rateNewTasting: (...a: unknown[]) => rateNewTasting(...a),
  updateTasting: (...a: unknown[]) => updateTasting(...a),
  undoTasting: (...a: unknown[]) => undoTasting(...a),
}))

const { TastingLogPanel } = await import('./tasting-log-panel')

function renderPanel(props: Partial<Parameters<typeof TastingLogPanel>[0]> = {}) {
  const onSaved = vi.fn()
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <TastingLogPanel brandId={7} hasChart history={{ kind: 'first' }} onSaved={onSaved} {...props} />
    </NextIntlClientProvider>,
  )
  return { onSaved }
}

beforeEach(() => {
  vi.clearAllMocks()
  rateNewTasting.mockResolvedValue({ status: 'ok', entryId: 'e1', tastingNumber: 2, loggedAt: 0 })
  updateTasting.mockResolvedValue({ status: 'ok' })
  undoTasting.mockResolvedValue({ status: 'ok' })
})

describe('§5 log panel', () => {
  it('says what tapping does before anything is saved', () => {
    renderPanel()
    expect(screen.getByText('Your take')).toBeTruthy()
    expect(screen.getByTestId('tasting-log-meta').textContent).toBe('First time for you')
    expect(screen.getByText('Tap a star and it’s logged — notes can wait.')).toBeTruthy()
    expect(screen.queryByTestId('tasting-log-note')).toBeNull()
  })

  it('logs on the first star tap — no Save button — and offers Undo', async () => {
    const { onSaved } = renderPanel()
    expect(screen.queryByRole('button', { name: /save/i })).toBeNull()

    fireEvent.click(screen.getByTestId('star-rating-4.5'))

    expect(screen.getByTestId('tasting-log-rating').textContent).toBe('4.5 · Outstanding')
    await waitFor(() => expect(screen.getByText('Logged')).toBeTruthy())
    expect(rateNewTasting).toHaveBeenCalledWith({ brandId: 7, rating: 4.5 })
    expect(screen.getByTestId('tasting-log-meta').textContent).toMatch(/2nd time$/)
    expect(screen.getByTestId('undo-notice').textContent).toContain('Logged · palate updated')
    expect(onSaved).toHaveBeenCalled()
  })

  it('re-rates the same entry on a second tap instead of logging another', async () => {
    renderPanel()
    fireEvent.click(screen.getByTestId('star-rating-3'))
    await waitFor(() => expect(screen.getByTestId('tasting-log-panel').dataset.logged).toBe(''))

    fireEvent.click(screen.getByTestId('star-rating-5'))
    await waitFor(() => expect(updateTasting).toHaveBeenCalledWith('e1', { rating: 5 }))
    expect(rateNewTasting).toHaveBeenCalledTimes(1)
  })

  it('saves the quick tags and the note to that entry', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    renderPanel()
    fireEvent.click(screen.getByTestId('star-rating-4'))
    await waitFor(() => expect(screen.getByTestId('tasting-log-note')).toBeTruthy())

    fireEvent.click(screen.getByTestId('tasting-tag-warm'))
    await waitFor(() => expect(updateTasting).toHaveBeenCalledWith('e1', { tags: ['warm'] }))

    fireEvent.change(screen.getByTestId('tasting-log-note'), { target: { value: 'Sour apple' } })
    await act(async () => {
      vi.advanceTimersByTime(800)
    })
    await waitFor(() => expect(updateTasting).toHaveBeenCalledWith('e1', { notes: 'Sour apple' }))
    vi.useRealTimers()
  })

  it('Undo removes the tasting and returns the panel to "Your take"', async () => {
    renderPanel()
    fireEvent.click(screen.getByTestId('star-rating-4'))
    await waitFor(() => expect(screen.getByTestId('undo-notice')).toBeTruthy())

    fireEvent.click(screen.getByTestId('undo-notice-undo'))
    await waitFor(() => expect(screen.getByText('Your take')).toBeTruthy())
    expect(undoTasting).toHaveBeenCalledWith('e1')
    expect(screen.getByTestId('tasting-log-rating').textContent).toBe('Tap to rate')
  })

  it('does not claim the palate moved for a sake with no flavor chart', async () => {
    renderPanel({ hasChart: false })
    fireEvent.click(screen.getByTestId('star-rating-4'))
    await waitFor(() => expect(screen.getByTestId('undo-notice').textContent).toContain('Logged'))
    expect(screen.getByTestId('undo-notice').textContent).not.toContain('palate')
  })

  it('puts the stars back and says so when the save fails', async () => {
    rateNewTasting.mockResolvedValue({ status: 'unavailable' })
    renderPanel()
    fireEvent.click(screen.getByTestId('star-rating-4'))
    await waitFor(() => expect(screen.getByTestId('tasting-log-error')).toBeTruthy())
    expect(screen.getByTestId('tasting-log-rating').textContent).toBe('Tap to rate')
  })
})
