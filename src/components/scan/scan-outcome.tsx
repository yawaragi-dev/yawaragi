'use client'

import { type ReactNode, useState } from 'react'
import { useTranslations } from 'next-intl'
import NextLink from 'next/link'
import { CameraRotate, CaretRight, Keyboard, MagnifyingGlass } from '@phosphor-icons/react/dist/ssr'
import { Link } from '@/i18n/navigation'
import { KeepItAnyway } from '@/components/sake/add-unlisted-bottling'

/**
 * §5a — one screen for every scan outcome that is not a match (design v1.5).
 * The pipeline's outcomes stay as it produces them; they share one
 * vocabulary instead of each inventing its own layout:
 *
 * - a bar: kicker · ghost "Scan again" (the rescan for every outcome — no
 *   inline "Scan again" buttons further down);
 * - a status block: a neutral icon (never accent — nothing here is good news),
 *   a title, one or two lines;
 * - "What we read", when something was read: the name and brewery as
 *   editable fields — the read is often almost right and the visitor can see
 *   the label — and "Search again" with the edited name. No confidence here;
 *   it lives in the Read by AI sheet;
 * - candidate rows, when there are any: a guess, so no percentage and no
 *   accent, and a reason in words;
 * - "Keep it anyway", whenever something was read and the visitor can keep a
 *   journal: the bottle is saved as their own bottling, with the name and
 *   brewery as they stand in "What we read" (design v1.6, ADR-0025);
 * - "Type the name instead", last.
 */

export interface OutcomeCandidate {
  key: string | number
  href: string
  /** Latin name when there is one, else the kanji. */
  name: string
  /** The kanji, shown small after a Latin name; `null` when `name` is it. */
  kanji: string | null
  /** "Rihaku Shuzō · Shimane". */
  where: string | null
  /** Why it is a candidate, in words: "Same name · different brewery". */
  reason: string
}

export interface OutcomeRead {
  name: string
  brewery: string
  /** The Read by AI badge, rendered by the caller (it owns the sheet). */
  badge: ReactNode
}

export function ScanOutcome({
  testId,
  icon,
  kicker,
  title,
  body,
  onRescan,
  read,
  candidates,
  tips,
  canKeep = false,
  children,
}: {
  testId: string
  icon: ReactNode
  kicker: string
  title: string
  body: ReactNode
  onRescan: () => void
  read?: OutcomeRead
  candidates?: { label: string; rows: readonly OutcomeCandidate[] }
  tips?: readonly { icon: ReactNode; text: string }[]
  /** Offer "Keep it anyway" — only to a visitor who can keep a journal (ADR-0020). */
  canKeep?: boolean
  /** Branch-specific actions under the status block (the consensus's Yes / No). */
  children?: ReactNode
}) {
  const t = useTranslations('scanOutcome')
  // The read, as the visitor has corrected it. Held here rather than in
  // "What we read" because "Keep it anyway", further down, saves the same two.
  const [name, setName] = useState(read?.name ?? '')
  const [brewery, setBrewery] = useState(read?.brewery ?? '')

  return (
    <section className="flex flex-col gap-5" data-testid={testId}>
      <div className="flex min-h-11 items-center justify-between gap-3">
        <span className="text-subtle text-ash-600" data-testid="scan-outcome-kicker">
          {kicker}
        </span>
        <button
          type="button"
          onClick={onRescan}
          className="-mr-2 flex min-h-11 items-center gap-1.5 rounded-md px-2 text-subtle font-medium text-ginshu-700 transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
          data-testid="scan-outcome-rescan"
        >
          <CameraRotate size={16} aria-hidden="true" />
          {t('scanAgain')}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-ash-600" aria-hidden="true">
          {icon}
        </span>
        <h2 className="text-title font-medium text-ink" data-testid="scan-outcome-title">
          {title}
        </h2>
        <div className="text-subtle leading-normal text-ash-700">{body}</div>
      </div>

      {children}

      {read && (
        <WhatWeRead
          badge={read.badge}
          name={name}
          brewery={brewery}
          onName={setName}
          onBrewery={setBrewery}
        />
      )}

      {candidates && candidates.rows.length > 0 && (
        <div className="flex flex-col">
          <span className="text-section-label uppercase text-ash-600">{candidates.label}</span>
          <CandidateRows rows={candidates.rows} testId="scan-outcome-candidates" />
        </div>
      )}

      {tips && tips.length > 0 && (
        <ul className="flex flex-col" role="list" data-testid="scan-outcome-tips">
          {tips.map((tip) => (
            <li key={tip.text} className="flex min-h-11 items-center gap-3 border-b border-divider text-subtle text-ink">
              <span className="text-ash-600" aria-hidden="true">
                {tip.icon}
              </span>
              {tip.text}
            </li>
          ))}
        </ul>
      )}

      {read && canKeep && <KeepItAnyway name={name} brewery={brewery} />}

      <Link
        href="/search"
        className="flex min-h-11 w-fit items-center gap-2 text-subtle font-medium text-ginshu-700 hover:text-ginshu-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
        data-testid="scan-outcome-type-it"
      >
        <Keyboard size={16} aria-hidden="true" />
        {t('typeInstead')}
      </Link>
    </section>
  )
}

/**
 * "What we read": the name and brewery as fields the visitor can fix from the
 * label, and "Search again" — a link to §8 with the (edited) name, so it lands
 * on a page the back button returns from. A link, not a form: the whole scan
 * screen already sits inside the scan `<form>`, and forms do not nest.
 */
function WhatWeRead({
  badge,
  name,
  brewery,
  onName,
  onBrewery,
}: {
  badge: ReactNode
  name: string
  brewery: string
  onName: (value: string) => void
  onBrewery: (value: string) => void
}) {
  const t = useTranslations('scanOutcome')
  const field =
    'min-h-11 w-full rounded-md border border-divider bg-ground px-3 text-body text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600'

  return (
    <div className="flex flex-col gap-3 rounded-xl bg-surface p-4 shadow-yw-sm" data-testid="scan-outcome-read">
      <div className="flex items-center justify-between gap-3">
        <span className="text-section-label uppercase text-ash-600">{t('whatWeRead')}</span>
        {badge}
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-section-label uppercase text-ash-600">{t('name')}</span>
        <input
          value={name}
          onChange={(e) => onName(e.target.value)}
          className={field}
          data-testid="scan-outcome-read-name"
        />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-section-label uppercase text-ash-600">{t('brewery')}</span>
        {/* Not sent to search: §8 searches by name. Editable all the same —
            fixing it is how a visitor checks the brewery against the label,
            and "Keep it anyway" saves it as it stands. */}
        <input
          value={brewery}
          onChange={(e) => onBrewery(e.target.value)}
          className={field}
          lang="ja"
          data-testid="scan-outcome-read-brewery"
        />
      </label>
      <p className="text-meta text-ash-600">{t('misreadHint')}</p>
      <Link
        href={name.trim() ? { pathname: '/search', query: { q: name.trim() } } : '/search'}
        className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-ash-300 text-subtle font-medium text-ink transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
        data-testid="scan-outcome-search-again"
      >
        <MagnifyingGlass size={16} aria-hidden="true" />
        {t('searchAgain')}
      </Link>
    </div>
  )
}

/**
 * §5a's candidate rows — Latin name + kanji · brewery · prefecture · a reason
 * in words · caret. A guess, so no percentage and no accent. Up to three.
 * Shared by the outcome screen and §5's Best-guess "Not sure?" list.
 */
export function CandidateRows({
  rows,
  testId,
  id,
}: {
  rows: readonly OutcomeCandidate[]
  testId: string
  id?: string
}) {
  return (
    <ul className="flex flex-col" role="list" data-testid={testId} id={id}>
      {rows.slice(0, 3).map((row) => (
        <li key={row.key} className="border-b border-divider">
          <NextLink
            href={row.href}
            className="flex min-h-14 items-center gap-3 py-3 transition-colors hover:bg-ash-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
            data-testid={`scan-outcome-candidate-${row.key}`}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-card-heading font-medium text-ink">{row.name}</span>
                {row.kanji && (
                  <span className="text-meta text-ash-600" lang="ja">
                    {row.kanji}
                  </span>
                )}
              </span>
              {row.where && <span className="text-meta text-ash-600">{row.where}</span>}
              <span className="text-meta text-ash-700">{row.reason}</span>
            </span>
            <CaretRight size={16} aria-hidden="true" className="shrink-0 text-ash-500" />
          </NextLink>
        </li>
      ))}
    </ul>
  )
}
