import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import en from '~/messages/en.json'

const addOwnBottling = vi.fn()
vi.mock('@/lib/collection/expression-actions', () => ({
  addOwnBottling: (...a: unknown[]) => addOwnBottling(...a),
}))
const push = vi.fn()
// Mocked to see where the visitor is sent; the shared next/navigation stub in
// vitest.setup.ts hands out a fresh spy per call.
vi.mock('@/i18n/navigation', async (importActual) => ({
  // The real module, so components that render a Link keep it (a partial
  // factory leaves every unlisted export undefined).
  ...(await importActual<typeof import('@/i18n/navigation')>()),
  useRouter: () => ({ push }),
}))

const { AddItYourselfRow } = await import('./add-unlisted-bottling')

function renderRow(query = 'fukuchiyo') {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <AddItYourselfRow query={query} />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('"Add it yourself" in search', () => {
  it('saves nothing on the first tap: it asks for the name, starting from what was typed', () => {
    renderRow()
    fireEvent.click(screen.getByRole('button', { name: /Add “fukuchiyo” yourself/ }))

    expect(addOwnBottling).not.toHaveBeenCalled()
    expect((screen.getByLabelText('Bottling name') as HTMLInputElement).value).toBe('fukuchiyo')
    expect((screen.getByLabelText('Brewery (optional)') as HTMLInputElement).value).toBe('')
  })

  it('keeps the bottle under the corrected name, with its brewery, and opens it ready to rate', async () => {
    addOwnBottling.mockResolvedValue({ status: 'ok', expressionId: 'x7' })
    renderRow()
    fireEvent.click(screen.getByRole('button', { name: /Add “fukuchiyo” yourself/ }))
    fireEvent.change(screen.getByLabelText('Bottling name'), { target: { value: ' 富久千代 ' } })
    fireEvent.change(screen.getByLabelText('Brewery (optional)'), { target: { value: '盛田屋' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add bottling' }))

    await waitFor(() =>
      expect(addOwnBottling).toHaveBeenCalledWith({ brandId: null, name: '富久千代', brewery: '盛田屋' }),
    )
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith({
        pathname: '/bottling/[id]',
        params: { id: 'x7' },
        query: { rate: '1' },
      }),
    )
  })

  it('needs only the name: the brewery can stay empty', async () => {
    addOwnBottling.mockResolvedValue({ status: 'ok', expressionId: 'x7' })
    renderRow('Fukuchiyo')
    fireEvent.click(screen.getByRole('button', { name: /Add “Fukuchiyo” yourself/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Add bottling' }))

    await waitFor(() =>
      expect(addOwnBottling).toHaveBeenCalledWith({ brandId: null, name: 'Fukuchiyo', brewery: undefined }),
    )
  })

  it('can say what the bottle is: grade, pasteurisation, starter, styles to tick, polishing and koji', async () => {
    addOwnBottling.mockResolvedValue({ status: 'ok', expressionId: 'x7' })
    renderRow('Fukuchiyo')
    fireEvent.click(screen.getByTestId('search-add-yourself'))

    fireEvent.change(screen.getByLabelText('Grade'), { target: { value: 'junmai_daiginjo' } })
    fireEvent.change(screen.getByLabelText('Pasteurisation'), { target: { value: 'nama' } })
    // v1.9 V1: starter, koji and other words wait behind one link.
    expect(screen.queryByLabelText('Starter')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Starter, koji, other style words' }))
    fireEvent.change(screen.getByLabelText('Starter'), { target: { value: 'kimoto' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Muroka' }))
    fireEvent.change(screen.getByLabelText('Polishing'), { target: { value: '40' } })
    fireEvent.change(screen.getByLabelText('Koji'), { target: { value: 'white' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add bottling' }))

    await waitFor(() =>
      expect(addOwnBottling).toHaveBeenCalledWith({
        brandId: null,
        name: 'Fukuchiyo',
        brewery: undefined,
        details: { grade: 'junmai_daiginjo', styles: ['Nama', 'Kimoto', 'Muroka'], polishingPct: 40, koji: 'white' },
      }),
    )
  })

  it('Cancel puts the row back and saves nothing', () => {
    renderRow()
    fireEvent.click(screen.getByRole('button', { name: /Add “fukuchiyo” yourself/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))

    expect(screen.queryByLabelText('Bottling name')).toBeNull()
    expect(screen.getByRole('button', { name: /Add “fukuchiyo” yourself/ })).toBeTruthy()
    expect(addOwnBottling).not.toHaveBeenCalled()
  })
})
