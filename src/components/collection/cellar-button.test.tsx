import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import en from '~/messages/en.json'

const addToCellar = vi.fn()
vi.mock('@/lib/collection/cellar-actions', () => ({
  addToCellar: (...a: unknown[]) => addToCellar(...a),
}))

const { CellarButton } = await import('./cellar-button')

function renderButton(initialCount: number) {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <CellarButton brandId={7} initialCount={initialCount} refreshOnSave={false} />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('the cellar control on a bottle', () => {
  it('adds the first bottle with one tap', async () => {
    addToCellar.mockResolvedValue({ status: 'ok', count: 1 })
    renderButton(0)
    fireEvent.click(screen.getByRole('button', { name: 'Add to cellar' }))
    await waitFor(() => expect(addToCellar).toHaveBeenCalledWith(7))
    expect(await screen.findByText('Added to your cellar')).toBeTruthy()
  })

  it('once owned, "In cellar" takes you to the cellar instead of adding another', () => {
    renderButton(2)
    const link = screen.getByRole('link', { name: /In cellar · 2/ })
    expect(link.getAttribute('href')).toBe('/en/collection?tab=cellar')
    fireEvent.click(link)
    expect(addToCellar).not.toHaveBeenCalled()
  })

  it('adds another bottle only from its own, separately labelled button', async () => {
    addToCellar.mockResolvedValue({ status: 'ok', count: 3 })
    renderButton(2)
    fireEvent.click(screen.getByRole('button', { name: 'Add another bottle' }))
    await waitFor(() => expect(addToCellar).toHaveBeenCalledWith(7))
    expect(await screen.findByText('Another bottle added · 3 in cellar')).toBeTruthy()
    expect(screen.getByRole('link', { name: /In cellar · 3/ })).toBeTruthy()
  })
})
