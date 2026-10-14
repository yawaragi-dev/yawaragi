'use client'

import { type ReactNode, useState } from 'react'
import { useTranslations } from 'next-intl'
import NextLink from 'next/link'
import { BookOpen, CameraRotate, CaretRight, Keyboard, MagnifyingGlass } from '@phosphor-icons/react/dist/ssr'
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
 * - "From both photos", when this photo and the visitor's previous one
 *   together point at a sake (#408): one candidate row above the read. A
 *   guess resting on two photos, so it sits beside the outcome and does not
 *   replace it — the two photos may be two bottles;
 * - a line suggesting another side of the bottle, on the outcomes where a
 *   second photo can help. No button: the bar's "Scan again" is the rescan,
 *   and the next photo is read together with this one without being asked;
 * - candidate rows, when there are any: a guess, so no percentage and no
 *   accent, and a reason in words;
 * - "Keep it anyway", whenever something was read and the visitor can keep a
 *   journal: the bottle is saved as their own bottling, with the name and
 *   brewery as they stand in "What we read" (design v1.6, ADR-0025);
 * - "Type the name instead", then "How to read a label" (the Learn entry),
 *   last.
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
  /**
   * The two once more in Latin letters, as the model read them. A visitor
   * who cannot read Japanese has only these to tell what was read.
   */
  nameRomaji?: string
  breweryRomaji?: string
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
  bothPhotos,
  suggestOtherSide = false,
  canKeep = false,
  primaryRescan = false,
  photo,
  aboutOtherDrinks = false,
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
  /** The sake this photo and the previous one together point at (#408). */
  bothPhotos?: OutcomeCandidate
  /** Say that another side of the bottle may help. Not shown beside `bothPhotos`. */
  suggestOtherSide?: boolean
  /** Offer "Keep it anyway" — only to a visitor who can keep a journal (ADR-0020). */
  canKeep?: boolean
  /**
   * Repeat "Scan again" as the screen's main button (design v1.7 G5, v1.7.1):
   * where shooting again is the whole answer, the bar's quiet one is not enough.
   */
  primaryRescan?: boolean
  /** The photo back, small (design v1.7 G2): an object URL that never leaves
   *  the browser, and its caption. */
  photo?: { url: string; caption: string }
  /** A third exit to Learn's "Sake and the other Japanese drinks" (design
   *  v1.7 §5a `not_sake`, 71). */
  aboutOtherDrinks?: boolean
  /** Branch-specific actions under the status block (the consensus's Yes / No). */
  children?: ReactNode
}) {
  const t = useTranslations('scanOutcome')
  // Design v1.7.1 (H): each field holds the Latin reading, the label's own
  // words sit under it. Worked out once, from the read as it arrived.
  const [nameField] = useState(() => fieldFromRead(read?.name ?? '', read?.nameRomaji))
  const [breweryField] = useState(() => fieldFromRead(read?.brewery ?? '', read?.breweryRomaji))
  // The read, as the visitor has corrected it. Held here rather than in
  // "What we read" because "Keep it anyway", further down, saves the same two.
  const [name, setName] = useState(nameField.value)
  const [brewery, setBrewery] = useState(breweryField.value)
  const nameEdited = name !== nameField.value
  const breweryEdited = brewery !== breweryField.value

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
        {suggestOtherSide && !bothPhotos && (
          <p className="text-subtle leading-normal text-ash-700" data-testid="scan-outcome-other-side">
            {t('otherSide')}
          </p>
        )}
      </div>

      {photo && (
        <figure className="flex items-end gap-3" data-testid="scan-outcome-photo">
          {/* eslint-disable-next-line @next/next/no-img-element -- a blob: URL of the visitor's own photo; next/image cannot optimise it */}
          <img src={photo.url} alt="" className="h-24 w-[72px] rounded-md object-cover" />
          <figcaption className="text-meta text-ash-600">{photo.caption}</figcaption>
        </figure>
      )}

      {primaryRescan && (
        <button
          type="button"
          onClick={onRescan}
          className="flex min-h-11 items-center justify-center gap-2 rounded-xl border-[1.5px] border-ginshu-400 px-4 text-body font-medium text-ginshu-700 transition-colors hover:bg-ginshu-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
          data-testid="scan-outcome-rescan-primary"
        >
          <CameraRotate size={16} aria-hidden="true" />
          {t('scanAgain')}
        </button>
      )}

      {bothPhotos && (
        <div className="flex flex-col">
          <span className="text-section-label uppercase text-ash-600">{t('bothPhotos.label')}</span>
          <CandidateRows rows={[bothPhotos]} testId="scan-outcome-both-photos" />
        </div>
      )}

      {children}

      {read && (
        <WhatWeRead
          badge={read.badge}
          name={name}
          brewery={brewery}
          nameOnLabel={nameField.onLabel}
          breweryOnLabel={breweryField.onLabel}
          // While the name is as read, search the label's own words: the
          // Latin reading is the model's, the kanji is what is printed.
          searchFor={nameEdited ? name : read.name}
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

      {read && canKeep && (
        <KeepItAnyway
          name={withLabelWords(name, nameField.onLabel)}
          brewery={withLabelWords(brewery, breweryField.onLabel)}
          aiName={!nameEdited && nameField.onLabel !== null}
          aiBrewery={!breweryEdited && breweryField.onLabel !== null}
        />
      )}

      <Link
        href="/search"
        className="flex min-h-11 w-fit items-center gap-2 text-subtle font-medium text-ginshu-700 hover:text-ginshu-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
        data-testid="scan-outcome-type-it"
      >
        <Keyboard size={16} aria-hidden="true" />
        {t('typeInstead')}
      </Link>
      {/* v1.6 §5a: on every outcome. A misread is the moment someone most
          wants to know where things sit on a label. */}
      <Link
        href={{ pathname: '/learn/[slug]', params: { slug: 'how-to-read-a-label' } }}
        className="-mt-3 flex min-h-11 w-fit items-center gap-2 text-subtle font-medium text-ginshu-700 hover:text-ginshu-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
        data-testid="scan-outcome-read-a-label"
      >
        <BookOpen size={16} aria-hidden="true" />
        {t('howToReadALabel')}
      </Link>
      {aboutOtherDrinks && (
        <Link
          href={{ pathname: '/learn/[slug]', params: { slug: 'other-japanese-drinks' } }}
          className="-mt-3 flex min-h-11 w-fit items-center gap-2 text-subtle font-medium text-ginshu-700 hover:text-ginshu-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
          data-testid="scan-outcome-other-drinks"
        >
          <BookOpen size={16} aria-hidden="true" />
          {t('otherDrinks')}
        </Link>
      )}
    </section>
  )
}

/**
 * What a field of "What we read" starts as (design v1.7.1, H1): the model's
 * Latin reading, with the label's own words kept for the line under it. A
 * name the label prints in Latin letters is its own reading, so there is no
 * line.
 */
export function fieldFromRead(
  printed: string,
  romaji: string | undefined,
): { value: string; onLabel: string | null } {
  const reading = romaji?.trim()
  if (!reading || reading.toLowerCase() === printed.trim().toLowerCase()) return { value: printed, onLabel: null }
  return { value: reading, onLabel: printed.trim() }
}

/**
 * A kept name (design v1.7.1, H2): the name as it stands, then the label's
 * words in brackets — "Kyōgoku (京極)". Left alone when the visitor has
 * already typed them in.
 */
export function withLabelWords(value: string, onLabel: string | null): string {
  const kept = value.trim()
  if (!onLabel || !kept || kept.includes(onLabel)) return value
  return `${kept} (${onLabel})`
}

/** A name as read, written the H2 way: "Kyōgoku (京極)". */
export function readName(printed: string, romaji: string | undefined): string {
  const { value, onLabel } = fieldFromRead(printed, romaji)
  return withLabelWords(value, onLabel)
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
  nameOnLabel,
  breweryOnLabel,
  searchFor,
  onName,
  onBrewery,
}: {
  badge: ReactNode
  name: string
  brewery: string
  nameOnLabel: string | null
  breweryOnLabel: string | null
  searchFor: string
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
        {nameOnLabel && <OnTheLabel words={nameOnLabel} testId="scan-outcome-read-name-on-label" />}
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
          data-testid="scan-outcome-read-brewery"
        />
        {breweryOnLabel && <OnTheLabel words={breweryOnLabel} testId="scan-outcome-read-brewery-on-label" />}
      </label>
      <p className="text-meta text-ash-600">{t('misreadHint')}</p>
      <Link
        href={searchFor.trim() ? { pathname: '/search', query: { q: searchFor.trim() } } : '/search'}
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
 * "On the label: 京極" under a field. It stays when the visitor edits the
 * field: it is what the label says, not what the field holds.
 */
function OnTheLabel({ words, testId }: { words: string; testId: string }) {
  const t = useTranslations('scanOutcome')
  return (
    <span className="text-meta text-ash-600" data-testid={testId}>
      {t.rich('onTheLabel', {
        words,
        ja: (chunks) => (
          <span className="text-ash-800" lang="ja">
            {chunks}
          </span>
        ),
      })}
    </span>
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
