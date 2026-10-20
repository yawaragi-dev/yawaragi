import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import en from '~/messages/en.json'

const exportMyCollection = vi.fn()
const deleteMyAccount = vi.fn()
vi.mock('@/lib/account/account-actions', () => ({
  exportMyCollection: () => exportMyCollection(),
  deleteMyAccount: (confirm: string) => deleteMyAccount(confirm),
}))

const { DeleteAccountRow, ExportJournalRow } = await import('./your-data-rows')

function wrap(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      {node}
    </NextIntlClientProvider>,
  )
}

const FILE = { status: 'ok', fileName: 'yawaragi-journal-2026-10-19.json', json: '{"formatVersion":3}\n' }

describe('Account → Export journal', () => {
  beforeEach(() => {
    exportMyCollection.mockReset()
  })

  it('hands the visitor their collection as a file', async () => {
    exportMyCollection.mockResolvedValue(FILE)
    const save = vi.fn()
    wrap(<ExportJournalRow save={save} />)

    fireEvent.click(screen.getByTestId('account-export'))

    expect(screen.getByTestId('account-export').textContent).toContain('Preparing your file…')
    await waitFor(() => expect(save).toHaveBeenCalledWith(FILE.fileName, FILE.json))
    expect(screen.getByTestId('account-export').textContent).toContain('Export journal')
  })

  it('says so when the file could not be prepared', async () => {
    exportMyCollection.mockResolvedValue({ status: 'unavailable' })
    wrap(<ExportJournalRow save={vi.fn()} />)

    fireEvent.click(screen.getByTestId('account-export'))

    expect(await screen.findByTestId('account-export-failed')).toBeTruthy()
  })
})

describe('Account → Delete account', () => {
  beforeEach(() => {
    exportMyCollection.mockReset()
    deleteMyAccount.mockReset()
  })

  it('asks first, says how many tastings go, and deletes nothing on "Keep it"', async () => {
    wrap(<DeleteAccountRow tastingCount={12} leave={vi.fn()} />)

    fireEvent.click(screen.getByTestId('account-delete'))
    const dialog = await screen.findByTestId('account-delete-dialog')
    expect(dialog.textContent).toContain('Delete account and journal?')
    expect(dialog.textContent).toContain('your 12 tastings are erased')

    fireEvent.click(screen.getByTestId('account-delete-keep'))
    await waitFor(() => expect(screen.queryByTestId('account-delete-dialog')).toBeNull())
    expect(deleteMyAccount).not.toHaveBeenCalled()
  })

  it('offers the export from inside the dialog', async () => {
    exportMyCollection.mockResolvedValue(FILE)
    const save = vi.fn()
    wrap(<DeleteAccountRow tastingCount={1} save={save} leave={vi.fn()} />)

    fireEvent.click(screen.getByTestId('account-delete'))
    fireEvent.click(await screen.findByTestId('account-delete-export'))

    await waitFor(() => expect(save).toHaveBeenCalledWith(FILE.fileName, FILE.json))
    expect(deleteMyAccount).not.toHaveBeenCalled()
  })

  it('deletes permanently and leaves for Home, signed out', async () => {
    deleteMyAccount.mockResolvedValue({ status: 'ok' })
    const leave = vi.fn()
    wrap(<DeleteAccountRow tastingCount={0} leave={leave} />)

    fireEvent.click(screen.getByTestId('account-delete'))
    fireEvent.click(await screen.findByTestId('account-delete-confirm'))

    await waitFor(() => expect(leave).toHaveBeenCalledWith('/'))
    expect(deleteMyAccount).toHaveBeenCalledWith('delete-permanently')
  })

  it('stays open and says so when the delete did not finish', async () => {
    deleteMyAccount.mockResolvedValue({ status: 'unavailable' })
    const leave = vi.fn()
    wrap(<DeleteAccountRow tastingCount={null} leave={leave} />)

    fireEvent.click(screen.getByTestId('account-delete'))
    expect((await screen.findByTestId('account-delete-dialog')).textContent).toContain('Your account, your journal')
    fireEvent.click(screen.getByTestId('account-delete-confirm'))

    expect(await screen.findByTestId('account-delete-failed')).toBeTruthy()
    expect(leave).not.toHaveBeenCalled()
  })
})
