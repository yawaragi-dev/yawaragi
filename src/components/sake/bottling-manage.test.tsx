import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import en from '~/messages/en.json'
import type { DeletedBottling } from '@/lib/collection/bottling-changes'

const renameOwnBottling = vi.fn()
const deleteOwnBottling = vi.fn()
const restoreOwnBottling = vi.fn()
vi.mock('@/lib/collection/expression-actions', () => ({
  renameOwnBottling: (...a: unknown[]) => renameOwnBottling(...a),
  deleteOwnBottling: (...a: unknown[]) => deleteOwnBottling(...a),
  restoreOwnBottling: (...a: unknown[]) => restoreOwnBottling(...a),
}))
const push = vi.fn()
const refresh = vi.fn()
// Mocked to see where the visitor is sent; the shared next/navigation stub in
// vitest.setup.ts hands out a fresh spy per call.
vi.mock('@/i18n/navigation', () => ({ useRouter: () => ({ push, refresh }) }))

const { BottlingManage } = await import('./bottling-manage')
const { DeletedBottlingNotice } = await import('./deleted-bottling-notice')
const { getPendingUndo, setPendingUndo } = await import('@/lib/collection/deleted-bottling-store')

const UNDO: DeletedBottling = {
  expression: {
    schemaVersion: 1,
    id: 'x1',
    own: true,
    brandId: 12,
    line: { nameKanji: '李白', nameRomaji: 'Rihaku' },
    name: 'Rihaku Harvest Moon',
    createdAt: 1,
    updatedAt: 1,
  },
  entries: [],
  cellar: [],
  createdCellarKeys: [],
}

function renderManage(props: Partial<Parameters<typeof BottlingManage>[0]> = {}) {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <BottlingManage
        expressionId="x1"
        name="Rihaku Harvest Moon"
        brewery={undefined}
        sake={{ brandId: 12, name: 'Rihaku' }}
        tastings={1}
        bottles={1}
        {...props}
      />
      <DeletedBottlingNotice />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  setPendingUndo(null)
})

describe('"This bottling": renaming', () => {
  it('opens the name as it is, saves the correction, and stays on the page', async () => {
    renameOwnBottling.mockResolvedValue({ status: 'ok' })
    renderManage()
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    const field = screen.getByLabelText('Bottling name') as HTMLInputElement
    expect(field.value).toBe('Rihaku Harvest Moon')
    // A bottling of a sake takes its brewery from the catalogue: no such field.
    expect(screen.queryByLabelText('Brewery (optional)')).toBeNull()

    fireEvent.change(field, { target: { value: 'Rihaku Wandering Poet' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(renameOwnBottling).toHaveBeenCalledWith({ expressionId: 'x1', name: 'Rihaku Wandering Poet', details: {} }),
    )
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(push).not.toHaveBeenCalled()
  })

  it('lets the brewery of a bottle with no sake be corrected too', async () => {
    renameOwnBottling.mockResolvedValue({ status: 'ok' })
    renderManage({ name: '富久千代', brewery: '盛田屋', sake: null })
    fireEvent.click(screen.getByRole('button', { name: 'Rename' }))
    expect((screen.getByLabelText('Brewery (optional)') as HTMLInputElement).value).toBe('盛田屋')
    fireEvent.change(screen.getByLabelText('Brewery (optional)'), { target: { value: '富久千代酒造' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(renameOwnBottling).toHaveBeenCalledWith({
        expressionId: 'x1',
        name: '富久千代',
        brewery: '富久千代酒造',
        details: {},
      }),
    )
  })
})

describe('"This bottling": deleting', () => {
  it('asks first, and says its tastings and bottles stay under the sake', () => {
    renderManage({ tastings: 3, bottles: 1 })
    fireEvent.click(screen.getByRole('button', { name: 'Delete bottling' }))
    expect(screen.getByTestId('bottling-delete-confirm').textContent).toContain(
      'Delete Rihaku Harvest Moon? Your 3 tastings and 1 bottle stay, under Rihaku.',
    )
    expect(deleteOwnBottling).not.toHaveBeenCalled()
  })

  it.each([
    [{ tastings: 1, bottles: 0 }, 'Your 1 tasting stays, under Rihaku.'],
    [{ tastings: 0, bottles: 2 }, 'Your 2 bottles stay, under Rihaku.'],
    [{ tastings: 2, bottles: 1, sake: null }, 'Your 2 tastings and 1 bottle go with it.'],
    [{ tastings: 1, bottles: 0, sake: null }, 'Your 1 tasting goes with it.'],
  ] as const)('states exactly what happens to what is logged against it (%#)', (props, sentence) => {
    renderManage(props)
    fireEvent.click(screen.getByRole('button', { name: 'Delete bottling' }))
    expect(screen.getByTestId('bottling-delete-confirm').textContent).toContain(sentence)
  })

  it('with nothing logged against it, only asks', () => {
    renderManage({ tastings: 0, bottles: 0 })
    fireEvent.click(screen.getByRole('button', { name: 'Delete bottling' }))
    expect(screen.getByTestId('bottling-delete-confirm').querySelector('p')!.textContent).toBe(
      'Delete Rihaku Harvest Moon?',
    )
  })

  it('"Keep it" deletes nothing', () => {
    renderManage()
    fireEvent.click(screen.getByRole('button', { name: 'Delete bottling' }))
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }))
    expect(screen.queryByTestId('bottling-delete-confirm')).toBeNull()
    expect(deleteOwnBottling).not.toHaveBeenCalled()
  })

  it('lands on the sake\'s page with an Undo that puts everything back and returns', async () => {
    deleteOwnBottling.mockResolvedValue({ status: 'ok', undo: UNDO })
    restoreOwnBottling.mockResolvedValue({ status: 'ok' })
    renderManage()
    fireEvent.click(screen.getByRole('button', { name: 'Delete bottling' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

    await waitFor(() => expect(deleteOwnBottling).toHaveBeenCalledWith('x1'))
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith({ pathname: '/sake/[brandId]', params: { brandId: '12' } }),
    )
    expect(await screen.findByText('Rihaku Harvest Moon deleted')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(restoreOwnBottling).toHaveBeenCalledWith(UNDO))
    await waitFor(() =>
      expect(push).toHaveBeenLastCalledWith({ pathname: '/bottling/[id]', params: { id: 'x1' } }),
    )
    expect(getPendingUndo()).toBeNull()
  })

  it('with no sake, lands on the journal', async () => {
    deleteOwnBottling.mockResolvedValue({ status: 'ok', undo: UNDO })
    renderManage({ sake: null })
    fireEvent.click(screen.getByRole('button', { name: 'Delete bottling' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith({ pathname: '/collection', query: { tab: 'journal' } }),
    )
  })

  it('says so when the delete did not happen, and offers no Undo for it', async () => {
    deleteOwnBottling.mockResolvedValue({ status: 'unavailable' })
    renderManage()
    fireEvent.click(screen.getByRole('button', { name: 'Delete bottling' }))
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(push).not.toHaveBeenCalled()
    expect(getPendingUndo()).toBeNull()
  })

  it('the Undo is offered for 6.8 seconds from the delete, then goes', async () => {
    vi.useFakeTimers()
    try {
      render(
        <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
          <DeletedBottlingNotice />
        </NextIntlClientProvider>,
      )
      const { act } = await import('@testing-library/react')
      act(() => setPendingUndo({ deleted: UNDO, at: Date.now() }))
      expect(screen.getByText('Rihaku Harvest Moon deleted')).toBeTruthy()
      act(() => vi.advanceTimersByTime(6700))
      expect(screen.queryByText('Rihaku Harvest Moon deleted')).toBeTruthy()
      act(() => vi.advanceTimersByTime(200))
      expect(screen.queryByText('Rihaku Harvest Moon deleted')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('edits the grade, polishing, styles and koji it was saved with', async () => {
    renameOwnBottling.mockResolvedValue({ status: 'ok' })
    renderManage({ details: { grade: 'junmai_ginjo', styles: ['Nama', 'Hand-pressed'], polishingPct: 55 } })
    fireEvent.click(screen.getByRole('button', { name: /Rename/ }))
    expect((screen.getByLabelText('Grade') as HTMLSelectElement).value).toBe('junmai_ginjo')
    expect((screen.getByLabelText('Polishing') as HTMLInputElement).value).toBe('55')
    // A known style word is a ticked box; anything else waits in "Other".
    expect((screen.getByRole('checkbox', { name: 'Nama' }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText(/Other style words/) as HTMLInputElement).value).toBe('Hand-pressed')

    fireEvent.click(screen.getByRole('checkbox', { name: 'Muroka' }))
    fireEvent.change(screen.getByLabelText('Koji'), { target: { value: 'white' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(renameOwnBottling).toHaveBeenCalledWith(
        expect.objectContaining({
          details: { grade: 'junmai_ginjo', styles: ['Nama', 'Muroka', 'Hand-pressed'], polishingPct: 55, koji: 'white' },
        }),
      ),
    )
  })
})
