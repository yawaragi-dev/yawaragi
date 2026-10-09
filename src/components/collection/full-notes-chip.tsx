'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { ListBullets } from '@phosphor-icons/react/dist/ssr'
import { DetailedNotesSheet } from '@/components/journal/detailed-notes-sheet'
import type { DetailedNotes } from '@/lib/schemas/detailed-notes'
import { tastingDayOf } from '@/lib/taste/tasting-day'

/**
 * §11's "Full notes" chip on a journal row (screenshot 19): it opens §10's
 * detailed-notes sheet for that tasting, the same sheet the log panel opens,
 * so the notes can be read and changed after the night itself. Shown only on
 * rows that have detailed notes, as §11 draws it.
 */
export function FullNotesChip({
  entryId,
  detail,
  triedAt,
}: {
  entryId: string
  detail: DetailedNotes
  triedAt: number
}) {
  const t = useTranslations('journal')
  const router = useRouter()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-8 items-center gap-1.5 self-start rounded-md bg-ash-200 px-2.5 text-meta text-ink transition-colors hover:bg-ash-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
        data-testid={`journal-full-notes-${entryId}`}
      >
        <ListBullets size={14} aria-hidden="true" />
        {t('fullNotes')}
      </button>
      <DetailedNotesSheet
        entryId={entryId}
        initial={detail}
        initialDay={tastingDayOf(triedAt)}
        open={open}
        onOpenChange={setOpen}
        // The row shows the day and whether notes exist; refresh both.
        onSaved={() => router.refresh()}
      />
    </>
  )
}
