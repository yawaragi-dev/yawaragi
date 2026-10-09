import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import en from '~/messages/en.json'

vi.mock('@/lib/taste/tasting-actions', () => ({
  rateNewTasting: vi.fn(async () => ({ status: 'ok', entryId: 'e1', tastingNumber: 1, loggedAt: 0 })),
  updateTasting: vi.fn(async () => ({ status: 'ok' })),
  undoTasting: vi.fn(),
}))

const { BottleRateRow } = await import('./bottle-rate-row')

describe("the bottle page's rating row", () => {
  it('"Done" closes the panel and brings back "Rate a new tasting"', async () => {
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <BottleRateRow brandId={7} chart={null} history={{ kind: 'first' }} similar={null} cellar={null} />
      </NextIntlClientProvider>,
    )
    fireEvent.click(screen.getByTestId('bottle-rate-open'))
    fireEvent.click(screen.getByTestId('star-rating-4'))
    fireEvent.click(await screen.findByRole('button', { name: 'Done' }))

    await waitFor(() => expect(screen.queryByTestId('tasting-log-panel')).toBeNull())
    expect(screen.getByTestId('bottle-rate-open').textContent).toContain('Rate a new tasting')
  })
})
