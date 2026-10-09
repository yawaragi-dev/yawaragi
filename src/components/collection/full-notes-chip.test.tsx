import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import en from '~/messages/en.json'

vi.mock('@/lib/taste/tasting-actions', () => ({ updateTasting: vi.fn() }))

const { FullNotesChip } = await import('./full-notes-chip')

describe('"Full notes" on a journal row', () => {
  it("opens that tasting's detailed notes, with what was filled in and its day", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <FullNotesChip entryId="s1" detail={{ palate: { umami: 4 } }} triedAt={Date.UTC(2026, 6, 18, 12)} />
      </NextIntlClientProvider>,
    )
    expect(screen.queryByText('Detailed notes')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Full notes' }))

    expect(screen.getByText('Detailed notes')).toBeTruthy()
    expect(screen.getByTestId('detailed-notes-progress').textContent).toBe('1 of 5 parts filled')
    expect((screen.getByLabelText('Tasted on') as HTMLInputElement).value).toBe('2026-07-18')
  })
})
