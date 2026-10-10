import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import en from '~/messages/en.json'

vi.mock('@/lib/taste/tasting-actions', () => ({
  rateNewTasting: vi.fn(),
  updateTasting: vi.fn(async () => ({ status: 'ok' })),
  undoTasting: vi.fn(async () => ({ status: 'ok' })),
}))

const { EditableTasting } = await import('./editable-tasting')

describe('a tasting in "You and this sake"', () => {
  it('opens in the panel to change or delete it, and Done puts it away', () => {
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <ul>
          <EditableTasting
            brandId={7}
            sakeName="Jikon"
            chart={null}
            tasting={{ entryId: 'e1', rating: 4, notes: 'Pear', triedAt: Date.UTC(2026, 6, 18, 12), tastingNumber: 1 }}
          >
            <span>row</span>
          </EditableTasting>
        </ul>
      </NextIntlClientProvider>,
    )
    expect(screen.queryByTestId('tasting-log-panel')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(screen.getByText('Your tasting')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Delete tasting' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByTestId('tasting-log-panel')).toBeNull()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeTruthy()
  })
})
