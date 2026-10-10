'use client'

import { useId, useState } from 'react'
import { useTranslations } from 'next-intl'
import { CaretDown, ListBullets } from '@phosphor-icons/react/dist/ssr'
import { CandidateRows, type OutcomeCandidate } from '@/components/scan/scan-outcome'

/**
 * §5 Best guess (0.60–0.84): under the card, a 44px row "Not sure? {n} other
 * candidates" that opens §5a's candidate rows in place — no separate screen.
 * Folded by default: the match is still the likeliest answer. Client-side
 * because of the open/closed state.
 */
export function OtherCandidates({ rows }: { rows: readonly OutcomeCandidate[] }) {
  const t = useTranslations('scanOutcome')
  const [open, setOpen] = useState(false)
  const listId = useId()
  if (rows.length === 0) return null
  const shown = rows.slice(0, 3)

  return (
    <div className="flex flex-col" data-testid="scan-result-other-candidates">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={listId}
        className="flex min-h-11 items-center gap-2 border-t border-divider text-subtle text-ash-700 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
        data-testid="scan-result-other-candidates-toggle"
      >
        <ListBullets size={16} aria-hidden="true" className="shrink-0 text-ash-600" />
        <span className="flex-1 text-left">{t('otherCandidates', { count: shown.length })}</span>
        <CaretDown
          size={16}
          aria-hidden="true"
          className={`shrink-0 text-ash-500 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <CandidateRows rows={shown} testId="scan-result-other-candidates-list" id={listId} />}
    </div>
  )
}
