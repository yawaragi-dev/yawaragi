import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import en from '~/messages/en.json'

const addToCellar = vi.fn()
vi.mock('@/lib/collection/cellar-actions', () => ({
  addToCellar: (...a: unknown[]) => addToCellar(...a),
}))

const { CellarButton } = await import('./cellar-button')

function renderButton(props: Partial<Parameters<typeof CellarButton>[0]> = {}) {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <CellarButton target={{ brandId: 7 }} name="Jikon" initialCount={0} refreshOnSave={false} {...props} />
    </NextIntlClientProvider>,
  )
}
const sheet = () => screen.getByTestId('cellar-sheet')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('the cellar control on a bottle', () => {
  it('asks first: "Add to cellar" opens the sheet, on one 720 ml bottle, not nama', () => {
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: 'Add to cellar' }))

    expect(addToCellar).not.toHaveBeenCalled()
    expect(sheet().textContent).toContain('Jikon')
    expect(screen.getByTestId('cellar-sheet-count').textContent).toBe('1')
    expect((screen.getByRole('radio', { name: '720 ml' }) as HTMLInputElement).checked).toBe(true)
    expect(screen.getByRole('switch', { name: /Nama/ }).getAttribute('aria-checked')).toBe('false')
  })

  it('adds what the sheet says: two bottles, 1.8 l, nama', async () => {
    addToCellar.mockResolvedValue({ status: 'ok', count: 2 })
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: 'Add to cellar' }))
    fireEvent.click(screen.getByRole('button', { name: 'One bottle more' }))
    fireEvent.click(screen.getByRole('radio', { name: '1800 ml' }))
    fireEvent.click(screen.getByRole('switch', { name: /Nama/ }))
    fireEvent.click(screen.getByTestId('cellar-sheet-submit'))

    await waitFor(() =>
      expect(addToCellar).toHaveBeenCalledWith({ brandId: 7 }, { count: 2, sizeMl: 1800, nama: true }),
    )
    expect(await screen.findByText('Added to your cellar')).toBeTruthy()
    expect(screen.getByRole('link', { name: /In cellar · 2/ })).toBeTruthy()
    // The sheet has gone.
    expect(screen.queryByTestId('cellar-sheet')).toBeNull()
  })

  it('adds the bottles to what the scan decides when they are added, nama as the label says', async () => {
    addToCellar.mockResolvedValue({ status: 'ok', count: 1 })
    const resolveTarget = vi.fn().mockResolvedValue({ expressionId: 'b1' })
    renderButton({ resolveTarget, initialNama: true })
    fireEvent.click(screen.getByRole('button', { name: 'Add to cellar' }))
    expect(screen.getByRole('switch', { name: /Nama/ }).getAttribute('aria-checked')).toBe('true')
    expect(resolveTarget).not.toHaveBeenCalled()

    fireEvent.click(screen.getByTestId('cellar-sheet-submit'))
    await waitFor(() =>
      expect(addToCellar).toHaveBeenCalledWith({ expressionId: 'b1' }, { count: 1, sizeMl: 720, nama: true }),
    )
  })

  it('adds nothing when that bottling cannot be added', async () => {
    renderButton({ resolveTarget: vi.fn().mockResolvedValue(null) })
    fireEvent.click(screen.getByRole('button', { name: 'Add to cellar' }))
    fireEvent.click(screen.getByTestId('cellar-sheet-submit'))
    await waitFor(() => expect(sheet()).toBeTruthy())
    expect(addToCellar).not.toHaveBeenCalled()
  })

  it('will not go below one bottle', () => {
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: 'Add to cellar' }))
    expect((screen.getByRole('button', { name: 'One bottle fewer' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('once owned, "In cellar" takes you to the cellar instead of adding another', () => {
    renderButton({ initialCount: 2 })
    const link = screen.getByRole('link', { name: /In cellar · 2/ })
    expect(link.getAttribute('href')).toBe('/en/collection?tab=cellar')
    fireEvent.click(link)
    expect(addToCellar).not.toHaveBeenCalled()
  })

  it('the "+" opens the same sheet, and says how many there are now', async () => {
    addToCellar.mockResolvedValue({ status: 'ok', count: 3 })
    renderButton({ initialCount: 2 })
    fireEvent.click(screen.getByRole('button', { name: 'Add another bottle' }))
    expect(sheet()).toBeTruthy()
    fireEvent.click(screen.getByTestId('cellar-sheet-submit'))

    await waitFor(() =>
      expect(addToCellar).toHaveBeenCalledWith({ brandId: 7 }, { count: 1, sizeMl: 720, nama: false }),
    )
    expect(await screen.findByText('Another bottle added · 3 in cellar')).toBeTruthy()
    expect(screen.getByRole('link', { name: /In cellar · 3/ })).toBeTruthy()
  })

  it("on a sake's page counts its bottlings' bottles too", async () => {
    addToCellar.mockResolvedValue({ status: 'ok', count: 3 })
    renderButton({ initialCount: 2, alsoCounted: 1 })
    // 2 of the sake + 1 of a bottling.
    expect(screen.getByRole('link', { name: /In cellar · 3/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add another bottle' }))
    fireEvent.click(screen.getByTestId('cellar-sheet-submit'))
    expect(await screen.findByText('Another bottle added · 4 in cellar')).toBeTruthy()
  })

  it("on a bottling's page adds a bottle of that bottling", async () => {
    addToCellar.mockResolvedValue({ status: 'ok', count: 1 })
    renderButton({ target: { expressionId: 'x1' }, name: 'Jikon Nama 2025' })
    fireEvent.click(screen.getByRole('button', { name: 'Add to cellar' }))
    fireEvent.click(screen.getByTestId('cellar-sheet-submit'))
    await waitFor(() =>
      expect(addToCellar).toHaveBeenCalledWith({ expressionId: 'x1' }, { count: 1, sizeMl: 720, nama: false }),
    )
  })

  it('keeps the sheet open and says so when it could not be saved', async () => {
    addToCellar.mockResolvedValue({ status: 'unavailable' })
    renderButton()
    fireEvent.click(screen.getByRole('button', { name: 'Add to cellar' }))
    fireEvent.click(screen.getByTestId('cellar-sheet-submit'))
    expect(await screen.findByTestId('cellar-sheet-error')).toBeTruthy()
    expect(sheet()).toBeTruthy()
  })
})
