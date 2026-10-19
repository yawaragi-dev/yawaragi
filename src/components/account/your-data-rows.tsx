'use client'

import { useState } from 'react'
import { DownloadSimple, Trash } from '@phosphor-icons/react/dist/ssr'
import { useTranslations } from 'next-intl'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import * as account from '@/lib/account/account-actions'
import { reachable } from '@/lib/network/settle-request'
import { cn } from '@/lib/utils'

const exportMyCollection = reachable(account.exportMyCollection)
const deleteMyAccount = reachable(account.deleteMyAccount)

const ROW = cn(
  'flex w-full min-h-[50px] items-center gap-3.5 px-4 py-2.5 text-left transition-colors',
  'border-b border-divider last:border-b-0 cursor-pointer',
  'hover:bg-ash-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ginshu-600',
  'disabled:cursor-default disabled:opacity-60',
)

function saveFile(fileName: string, json: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)
}

type ExportState = 'idle' | 'pending' | 'failed'

/** Asks the server for the visitor's collection and hands it to the browser as a file. */
function useExportJournal(save: (fileName: string, json: string) => void) {
  const [state, setState] = useState<ExportState>('idle')
  const run = async () => {
    setState('pending')
    const result = await exportMyCollection()
    if (result.status === 'ok') {
      save(result.fileName, result.json)
      setState('idle')
    } else {
      setState('failed')
    }
  }
  return { state, run }
}

/**
 * §15 "Your journal → Export journal": the visitor's journal, cellar and own
 * bottlings as the JSON file `pnpm journal:restore` reads (Art. 15 and 20).
 * The design also lists CSV; JSON is the format that carries everything.
 */
export function ExportJournalRow({ save = saveFile }: { save?: (fileName: string, json: string) => void }) {
  const t = useTranslations('account.yourData')
  const { state, run } = useExportJournal(save)
  return (
    <div className="border-b border-divider last:border-b-0">
      <button
        type="button"
        disabled={state === 'pending'}
        aria-busy={state === 'pending'}
        onClick={() => void run()}
        className={ROW}
        data-testid="account-export"
      >
        <DownloadSimple size={20} className="shrink-0 text-ash-600" aria-hidden="true" />
        <span className="text-body text-ink">{state === 'pending' ? t('exportPending') : t('exportLabel')}</span>
        <span className="ml-auto text-meta text-ash-700">{t('exportValue')}</span>
      </button>
      {state === 'failed' && (
        <p role="alert" className="px-4 pb-3 text-meta text-ginshu-700" data-testid="account-export-failed">
          {t('exportFailed')}
        </p>
      )}
    </div>
  )
}

/**
 * §15 "Account → Delete account" and its dialog: "Delete account and
 * journal?", what goes and from where, "Export journal first", "Keep it",
 * "Delete permanently" (Art. 17). On success the session is gone with the
 * account, so the page reloads at Home, signed out.
 */
export function DeleteAccountRow({
  tastingCount,
  save = saveFile,
  leave = (path: string) => window.location.replace(path),
}: {
  /** The visitor's tastings, for the dialog's body; `null` when it could not be read. */
  tastingCount: number | null
  save?: (fileName: string, json: string) => void
  leave?: (path: string) => void
}) {
  const t = useTranslations('account.yourData')
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<'idle' | 'pending' | 'failed'>('idle')
  const exporter = useExportJournal(save)

  const remove = async () => {
    setState('pending')
    const result = await deleteMyAccount('delete-permanently')
    if (result.status === 'ok') {
      leave('/')
    } else {
      setState('failed')
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => state !== 'pending' && setOpen(next)}>
      <button type="button" onClick={() => setOpen(true)} className={ROW} data-testid="account-delete">
        <Trash size={20} className="shrink-0 text-ash-600" aria-hidden="true" />
        <span className="text-body text-ink">{t('deleteLabel')}</span>
      </button>
      <DialogContent showCloseButton={false} className="flex flex-col gap-4 p-5" data-testid="account-delete-dialog">
        <DialogTitle className="text-title font-medium text-ink">{t('deleteTitle')}</DialogTitle>
        <DialogDescription className="text-body text-ash-700">
          {tastingCount === null ? t('deleteBodyUncounted') : t('deleteBody', { count: tastingCount })}
        </DialogDescription>
        {state === 'failed' && (
          <p role="alert" className="text-meta text-ginshu-700" data-testid="account-delete-failed">
            {t('deleteFailed')}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <button
            type="button"
            disabled={exporter.state === 'pending' || state === 'pending'}
            aria-busy={exporter.state === 'pending'}
            onClick={() => void exporter.run()}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-ash-300 px-4 text-body text-ink transition-colors hover:bg-ash-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600 disabled:opacity-60"
            data-testid="account-delete-export"
          >
            <DownloadSimple size={18} aria-hidden="true" />
            {exporter.state === 'pending' ? t('exportPending') : t('deleteExportFirst')}
          </button>
          {exporter.state === 'failed' && <p role="alert" className="text-meta text-ginshu-700">{t('exportFailed')}</p>}
          <button
            type="button"
            disabled={state === 'pending'}
            onClick={() => setOpen(false)}
            className="flex min-h-11 items-center justify-center rounded-xl border border-ash-300 px-4 text-body text-ink transition-colors hover:bg-ash-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600 disabled:opacity-60"
            data-testid="account-delete-keep"
          >
            {t('deleteKeep')}
          </button>
          <button
            type="button"
            disabled={state === 'pending'}
            aria-busy={state === 'pending'}
            onClick={() => void remove()}
            className="flex min-h-11 items-center justify-center rounded-xl border border-ginshu-700 bg-ginshu-100 px-4 text-body font-medium text-ginshu-800 transition-colors hover:bg-ginshu-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600 disabled:opacity-60"
            data-testid="account-delete-confirm"
          >
            {state === 'pending' ? t('deletePending') : t('deleteConfirm')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
