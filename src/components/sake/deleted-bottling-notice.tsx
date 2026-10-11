'use client'

import { useEffect, useState, useSyncExternalStore, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { UndoNotice } from '@/components/journal/undo-notice'
import { useRouter } from '@/i18n/navigation'
import {
  getPendingUndo,
  getServerPendingUndo,
  setPendingUndo,
  subscribePendingUndo,
} from '@/lib/collection/deleted-bottling-store'
import { restoreOwnBottling } from '@/lib/collection/expression-actions'

/** Rule 1: every Undo notice stays for 6.8s. */
const NOTICE_MS = 6800

/**
 * "{name} deleted · Undo" (design v1.6.2, screenshot 70). Mounted once, in the
 * app shell, because the notice shows on the page a delete lands on, not the
 * one it happened on. Undo puts the bottling, its tastings and its cellar rows
 * back in one step and returns to its page.
 */
export function DeletedBottlingNotice() {
  const t = useTranslations('bottling')
  const router = useRouter()
  const pendingUndo = useSyncExternalStore(subscribePendingUndo, getPendingUndo, getServerPendingUndo)
  const [failed, setFailed] = useState(false)
  const [restoring, startTransition] = useTransition()

  // The notice counts from the delete, so arriving late on the next page does
  // not buy it more time.
  useEffect(() => {
    if (!pendingUndo) return
    const left = pendingUndo.at + NOTICE_MS - Date.now()
    const timer = setTimeout(() => setPendingUndo(null), Math.max(0, left))
    return () => clearTimeout(timer)
  }, [pendingUndo])

  if (!pendingUndo) return null
  const { deleted } = pendingUndo

  function undo() {
    if (restoring) return
    setFailed(false)
    startTransition(async () => {
      const result = await restoreOwnBottling(deleted)
      if (result.status !== 'ok') {
        setFailed(true)
        return
      }
      setPendingUndo(null)
      router.push({ pathname: '/bottling/[id]', params: { id: deleted.expression.id } })
    })
  }

  return (
    <UndoNotice
      message={failed ? t('undoError') : t('deletedNotice', { name: deleted.expression.name })}
      undoLabel={t('undo')}
      onUndo={undo}
    />
  )
}
