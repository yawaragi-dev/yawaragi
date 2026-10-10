import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import en from '~/messages/en.json'

const addOwnBottling = vi.fn()
vi.mock('@/lib/collection/expression-actions', () => ({
  addOwnBottling: (...a: unknown[]) => addOwnBottling(...a),
}))
const push = vi.fn()
// Mocked to see where the form sends the visitor; the shared next/navigation
// stub in vitest.setup.ts hands out a fresh spy per call.
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push }) }))

const { AddBottlingRow } = await import('./add-bottling-row')

function renderRow() {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <AddBottlingRow brandId={12} lineName="Rihaku" />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('"Add your bottling" on a sake page', () => {
  it('asks for nothing until it is tapped, then only for a name, starting from the sake\'s', () => {
    renderRow()
    expect(screen.queryByLabelText('Bottling name')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: /Add your bottling/ }))
    expect((screen.getByLabelText('Bottling name') as HTMLInputElement).value).toBe('Rihaku')
    expect(screen.getByText(/Only you can see it/)).toBeTruthy()
  })

  it('saves the name as typed and opens the new bottling\'s page', async () => {
    addOwnBottling.mockResolvedValue({ status: 'ok', expressionId: 'x1' })
    renderRow()
    fireEvent.click(screen.getByRole('button', { name: /Add your bottling/ }))
    fireEvent.change(screen.getByLabelText('Bottling name'), {
      target: { value: ' Rihaku Wandering Poet ' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add bottling' }))

    await waitFor(() =>
      expect(addOwnBottling).toHaveBeenCalledWith({ brandId: 12, name: 'Rihaku Wandering Poet' }),
    )
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith({ pathname: '/bottling/[id]', params: { id: 'x1' } }),
    )
  })

  it('will not save an empty name', () => {
    renderRow()
    fireEvent.click(screen.getByRole('button', { name: /Add your bottling/ }))
    fireEvent.change(screen.getByLabelText('Bottling name'), { target: { value: '   ' } })
    expect((screen.getByRole('button', { name: 'Add bottling' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('says so when it could not be saved, and stays open with what was typed', async () => {
    addOwnBottling.mockResolvedValue({ status: 'unavailable' })
    renderRow()
    fireEvent.click(screen.getByRole('button', { name: /Add your bottling/ }))
    fireEvent.change(screen.getByLabelText('Bottling name'), { target: { value: 'Nama' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add bottling' }))

    expect(await screen.findByRole('alert')).toBeTruthy()
    expect((screen.getByLabelText('Bottling name') as HTMLInputElement).value).toBe('Nama')
    expect(push).not.toHaveBeenCalled()
  })

  it('Cancel puts the row back as it was', () => {
    renderRow()
    fireEvent.click(screen.getByRole('button', { name: /Add your bottling/ }))
    fireEvent.change(screen.getByLabelText('Bottling name'), { target: { value: 'Nama' } })
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByLabelText('Bottling name')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Add your bottling/ }))
    expect((screen.getByLabelText('Bottling name') as HTMLInputElement).value).toBe('Rihaku')
  })
})
