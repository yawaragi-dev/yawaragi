import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import en from '~/messages/en.json'

const updateTasting = vi.fn()
vi.mock('@/lib/taste/tasting-actions', () => ({
  updateTasting: (...a: unknown[]) => updateTasting(...a),
}))

const { DetailedNotesSheet } = await import('./detailed-notes-sheet')

function renderSheet(initial?: Parameters<typeof DetailedNotesSheet>[0]['initial']) {
  const onSaved = vi.fn()
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <DetailedNotesSheet
        entryId="e1"
        initial={initial}
        initialDay="2026-10-08"
        open
        onOpenChange={() => {}}
        onSaved={onSaved}
      />
    </NextIntlClientProvider>,
  )
  return { onSaved }
}

beforeEach(() => {
  vi.clearAllMocks()
  updateTasting.mockResolvedValue({ status: 'ok' })
})

describe('§10 detailed notes', () => {
  it('opens on the first part, Appearance, with everything optional and no Save button', () => {
    renderSheet()
    expect(screen.getByTestId('detailed-notes-progress').textContent).toBe('All optional')
    expect(screen.getByTestId('detailed-notes-clarity-clear')).toBeTruthy()
    expect(screen.queryByTestId('detailed-notes-scale-umami-4')).toBeNull()
    expect(screen.queryByRole('button', { name: /^save/i })).toBeNull()
  })

  it('moves the tasting to another day, and offers no day after today', async () => {
    const { onSaved } = renderSheet()
    const day = screen.getByLabelText('Tasted on') as HTMLInputElement
    expect(day.value).toBe('2026-10-08')
    // Shown day first, European style, whatever the browser's own format.
    expect(screen.getByTestId('detailed-notes-tried-on-shown').textContent).toBe('08.10.2026')
    expect(day.max).toBe(new Date().toLocaleDateString('en-CA'))
    expect(day.min).toBe('2000-01-01')

    fireEvent.change(day, { target: { value: '2026-10-01' } })
    await waitFor(() => expect(updateTasting).toHaveBeenLastCalledWith('e1', { triedOn: '2026-10-01' }))
    expect(screen.getByTestId('detailed-notes-tried-on-shown').textContent).toBe('01.10.2026')
    expect(onSaved).toHaveBeenCalled()
  })

  it('does not save a half-typed or cleared day', () => {
    renderSheet()
    fireEvent.change(screen.getByLabelText('Tasted on'), { target: { value: '' } })
    expect(updateTasting).not.toHaveBeenCalled()
  })

  it('saves a palate step as a key, and tapping it again clears it', async () => {
    const { onSaved } = renderSheet()
    fireEvent.click(screen.getByTestId('detailed-notes-toggle-palate'))
    fireEvent.click(screen.getByTestId('detailed-notes-scale-umami-4'))
    await waitFor(() =>
      expect(updateTasting).toHaveBeenLastCalledWith('e1', { detail: { palate: { umami: 4 } } }),
    )
    expect(screen.getByTestId('detailed-notes-scale-umami-value').textContent).toBe('Rich')
    expect(screen.getByTestId('detailed-notes-progress').textContent).toBe('1 of 5 parts filled')
    expect(onSaved).toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('detailed-notes-scale-umami-4'))
    await waitFor(() => expect(screen.getByTestId('detailed-notes-progress').textContent).toBe('All optional'))
  })

  it('summarises a closed part in words and counts it as filled', async () => {
    renderSheet()
    fireEvent.click(screen.getByTestId('detailed-notes-toggle-nose'))
    fireEvent.click(screen.getByTestId('detailed-notes-aromas-koji'))
    fireEvent.click(screen.getByTestId('detailed-notes-aromas-fruit'))
    await waitFor(() =>
      expect(updateTasting).toHaveBeenLastCalledWith('e1', {
        detail: { nose: { aromas: ['koji', 'fruit'] } },
      }),
    )
    expect(screen.getByTestId('detailed-notes-summary-nose').textContent).toBe('Koji, Fruit')
  })

  it('reopens with what was saved before', () => {
    renderSheet({ verdict: { again: 'yes' }, serve: { temperature: 'nurukan' } })
    expect(screen.getByTestId('detailed-notes-progress').textContent).toBe('2 of 5 parts filled')
    expect(screen.getByTestId('detailed-notes-summary-verdict').textContent).toBe('Yes')
    expect(screen.getByTestId('detailed-notes-summary-serve').textContent).toBe('nurukan 40°')
  })

  it('offers six serving temperatures by romaji, with the kanji in a sheet that explains them', () => {
    renderSheet()
    fireEvent.click(screen.getByTestId('detailed-notes-toggle-serve'))
    const chips = screen.getByRole('group', { name: 'Temperature' }).querySelectorAll('button[aria-pressed]')
    expect([...chips].map((c) => c.textContent)).toEqual([
      'yukibie 5°',
      'hanabie 10°',
      'suzuhie 15°',
      'jōon 20°',
      'nurukan 40°',
      'atsukan 50°',
    ])
    // §16's pattern: the caveat is in the DOM and wired to the info button.
    const caveat = screen.getByTestId('info-sheet-serving-temperatures-caveat')
    expect(screen.getByTestId('info-sheet-serving-temperatures-trigger').getAttribute('aria-describedby')).toBe(caveat.id)
    fireEvent.click(screen.getByTestId('info-sheet-serving-temperatures-trigger'))
    const terms = screen.getByTestId('serving-temperature-terms').textContent
    expect(terms).toContain('涼冷え')
    expect(terms).toContain('Cool, just under room temperature')
  })

  it('reads a saved temperature back in the part summary', () => {
    renderSheet({ serve: { temperature: 'suzuhie' } })
    expect(screen.getByTestId('detailed-notes-summary-serve').textContent).toBe('suzuhie 15°')
  })

  it('says so when a save fails', async () => {
    updateTasting.mockResolvedValue({ status: 'unavailable' })
    renderSheet()
    fireEvent.click(screen.getByTestId('detailed-notes-toggle-palate'))
    fireEvent.click(screen.getByTestId('detailed-notes-scale-body-3'))
    await waitFor(() => expect(screen.getByTestId('detailed-notes-error')).toBeTruthy())
  })
})
