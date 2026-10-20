import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const push = vi.fn()
vi.mock('next/navigation', async (importActual) => ({
  ...(await importActual<typeof import('next/navigation')>()),
  useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
}))

const { SearchField } = await import('./search-field')

const row = (brandId: number, nameKanji: string, nameRomaji: string) => ({
  brandId,
  nameKanji,
  nameRomaji,
  breweryKanji: '旭酒造',
  breweryRomaji: 'Asahi Shuzo',
  href: `/en/sake/${brandId}`,
})

function field(fetchSuggestions: (q: string, l: string, s: AbortSignal) => Promise<{ query: string; rows: ReturnType<typeof row>[] }>, defaultValue = '') {
  render(
    <form>
      <label>
        <SearchField
          id="f"
          defaultValue={defaultValue}
          autoFocus={false}
          placeholder="Name"
          locale="en"
          listLabel="Matching sakes"
          footer="Latin spellings are machine transliterations."
          fetchSuggestions={fetchSuggestions}
        />
      </label>
    </form>,
  )
  return screen.getByRole('combobox')
}

async function type(input: HTMLElement, value: string) {
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value } })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(200)
  })
}

describe('§8 search field: matches as you type', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    push.mockClear()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('lists the matching sakes under the field once a few letters are in', async () => {
    const fetch = vi.fn(async (q: string) => ({ query: q, rows: [row(1, '獺祭', 'Dassai'), row(2, '旦', 'Dan')] }))
    const input = field(fetch)

    await type(input, 'da')

    expect(fetch).toHaveBeenCalledWith('da', 'en', expect.any(AbortSignal))
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      expect.stringContaining('Dassai'),
      expect.stringContaining('Dan'),
    ])
    expect(input.getAttribute('aria-expanded')).toBe('true')
  })

  it('asks nothing for a single Latin letter, which would match half the catalogue', async () => {
    const fetch = vi.fn(async (q: string) => ({ query: q, rows: [row(1, '獺祭', 'Dassai')] }))
    const input = field(fetch)

    await type(input, 'd')

    expect(fetch).not.toHaveBeenCalled()
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('waits for the typing to pause, then asks once', async () => {
    const fetch = vi.fn(async (q: string) => ({ query: q, rows: [] }))
    const input = field(fetch)

    fireEvent.change(input, { target: { value: 'da' } })
    fireEvent.change(input, { target: { value: 'das' } })
    fireEvent.change(input, { target: { value: 'dass' } })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith('dass', 'en', expect.any(AbortSignal))
  })

  it('never shows an answer to something the field no longer says', async () => {
    const input = field(async () => ({ query: 'da', rows: [row(1, '獺祭', 'Dassai')] }))

    await type(input, 'dass')

    expect(screen.queryByRole('listbox')).toBeNull()
  })

  it('moves through the rows with the arrow keys and opens the chosen sake on Enter', async () => {
    const input = field(async (q) => ({ query: q, rows: [row(1, '獺祭', 'Dassai'), row(2, '旦', 'Dan')] }))
    await type(input, 'da')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    const options = screen.getAllByRole('option')
    expect(input.getAttribute('aria-activedescendant')).toBe(options[1]!.id)
    expect(options[1]!.getAttribute('aria-selected')).toBe('true')

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(push).toHaveBeenCalledWith('/en/sake/2')
  })

  it('opens a sake when its row is tapped', async () => {
    const input = field(async (q) => ({ query: q, rows: [row(1, '獺祭', 'Dassai')] }))
    await type(input, 'da')

    fireEvent.click(screen.getByRole('option'))

    expect(push).toHaveBeenCalledWith('/en/sake/1')
  })

  it('closes on Escape and leaves Enter to the plain search', async () => {
    const input = field(async (q) => ({ query: q, rows: [row(1, '獺祭', 'Dassai')] }))
    await type(input, 'da')

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).toBeNull()

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(push).not.toHaveBeenCalled()
  })

  it('opens no list for the query whose results the page already shows', async () => {
    const fetch = vi.fn(async (q: string) => ({ query: q, rows: [row(1, '獺祭', 'Dassai')] }))
    const input = field(fetch, 'dassai')

    fireEvent.focus(input)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })

    expect(fetch).not.toHaveBeenCalled()
    expect((input as HTMLInputElement).value).toBe('dassai')
  })

  it('shows nothing when the suggestions cannot be fetched', async () => {
    const input = field(async () => {
      throw new Error('offline')
    })

    await type(input, 'da')

    expect(screen.queryByRole('listbox')).toBeNull()
  })
})
