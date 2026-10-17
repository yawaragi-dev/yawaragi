'use client'

// 'use client': the sort control, the filter chips and the collapsed
// "Not sake" group are local state, and the screen is reached in place from
// the scan form, which is already a client component.

import { useState, type ReactNode } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import NextLink from 'next/link'
import {
  ArrowLeft,
  BookOpen,
  CameraRotate,
  CaretDown,
  CaretRight,
  CaretUp,
  Drop,
  EyeSlash,
  Hexagon,
  Info,
  MagnifyingGlass,
  Question,
} from '@phosphor-icons/react/dist/ssr'
import { Link } from '@/i18n/navigation'
import { AddListLineYourself } from '@/components/sake/add-unlisted-bottling'
import { InfoSheetPanel } from '@/components/ui/info-sheet'
import { ProvenanceBadgeView } from '@/components/sake/provenance-badge'
import { resolveBadgeKind } from '@/lib/provenance/policy'
import { Sheet, SheetTrigger } from '@/components/ui/sheet'
import { FLAVOR_AXES, type FlavorAxis, type FlavorChart } from '@/lib/schemas/flavor-chart'
import type { ListLine, ListReason, ListResult, ListRow } from '@/lib/scan/list-action-state'
import { gradeLabel, styleLabel } from '@/lib/scan/read-bottling'
import { PALATE_READ_THRESHOLD } from '@/lib/taste/palate-read'
import { cheapPriceLimit, filterListRows, type ListFilter } from '@/lib/scan/list-filters'

/**
 * Design v1.7 §7 — "what should I order from this menu, or take from this
 * shelf?" (76–82). One screen for both: a menu has prices and "Menu order",
 * a shelf "Left to right" and no price chip.
 *
 * Every sentence on it is built from the flavor charts and the visitor's own
 * ratings (C8); nothing here is model text except what was read off the
 * photo, which is shown as read.
 *
 * The Sakenowa credit for the flavor shapes is the scan page's end-of-screen
 * block (rule 15), directly under this list — one credit per screen.
 */
export function ListResults({
  result,
  onBack,
  onRetake,
}: {
  result: ListResult
  onBack: () => void
  onRetake: () => void
}) {
  const t = useTranslations('listResults')
  const locale = useLocale()
  const isMenu = result.kind === 'menu'
  const [sort, setSort] = useState<'forYou' | 'listOrder'>('forYou')
  const [filters, setFilters] = useState<readonly ListFilter[]>([])

  const cheap = isMenu ? cheapPriceLimit(result.currency) : null
  const anyWarm = result.rows.some((r) => r.lines.some((l) => l.warm))
  const anyPrice = result.rows.some((r) => r.lines.some((l) => l.price !== undefined))
  const anyNew = result.rows.some((r) => r.yourRating === null)
  // Chips that would filter on nothing are not offered: a tap that cannot
  // change the list is a dead control.
  const chips: ListFilter[] = [
    ...(isMenu && anyWarm ? (['warm'] as const) : []),
    ...(cheap !== null && anyPrice ? (['cheap'] as const) : []),
    ...(anyNew ? (['new'] as const) : []),
  ]
  const ordered =
    result.ranked && sort === 'forYou'
      ? result.rows
      : [...result.rows].sort((a, b) => (a.lines[0]?.index ?? 0) - (b.lines[0]?.index ?? 0))
  const shown = filterListRows(ordered, filters, cheap)
  const top = result.ranked ? result.rows.find((r) => r.fit !== null) : undefined
  const sakeCount = result.rows.length + result.unmatched.length
  const price = (amount: number | undefined) => (amount === undefined ? null : formatPrice(amount, result.currency, locale))

  return (
    <section className="flex flex-col gap-4 px-5 py-5" data-testid="list-results" data-list-kind={result.kind}>
      <ListBar
        title={t('bar', { kind: result.kind, count: sakeCount })}
        onBack={onBack}
        onRetake={onRetake}
      />

      <div className="flex flex-col gap-1.5">
        <h2 className="text-headline font-medium text-ink" data-testid="list-headline">
          {top
            ? t(isMenu ? 'orderThe' : 'tryThe', { name: firstWord(top.nameRomaji ?? top.nameKanji) })
            : t(isMenu ? 'whatsOnMenu' : 'whatsOnShelf')}
        </h2>
        {result.ranked ? (
          <p className="text-subtle leading-normal text-ash-700">
            {t('rankedBy')}{' '}
            <HowThisIsRanked />
          </p>
        ) : (
          <p className="text-subtle leading-normal text-ash-700">{t(isMenu ? 'inMenuOrder' : 'leftToRightShapes')}</p>
        )}
        {/* Names, grades, styles and prices on this screen are the model's
            reading of the photo (CLAUDE.md: no llm_extracted value without
            the badge). One badge for the list, not one per row. §7 draws
            none; placement is a design question (block P). */}
        <div className="self-start" data-testid="list-read-badge">
          <ReadByAiBadge />
        </div>
      </div>

      {!result.ranked && (
        <div className="flex items-center gap-3 rounded-xl bg-surface p-4 shadow-yw-sm" data-testid="list-rate-three">
          <Hexagon size={22} aria-hidden="true" className="shrink-0 text-ginshu-600" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-subtle text-ink">{t('rateThree')}</span>
            <span className="text-meta text-ash-600">
              {t('soFar', { count: Math.min(result.tastings, PALATE_READ_THRESHOLD), of: PALATE_READ_THRESHOLD })}
            </span>
          </div>
          <Link
            href="/search"
            className="flex min-h-11 shrink-0 items-center rounded-lg border border-ash-300 px-3 text-subtle font-medium text-ink transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
            data-testid="list-find-one"
          >
            {t('findOne')}
          </Link>
        </div>
      )}

      {(result.ranked || chips.length > 0) && (
        <div className="flex flex-wrap gap-2" data-testid="list-controls">
          {result.ranked && (
            <div className="flex rounded-lg border border-ash-300 p-0.5" role="group" aria-label={t('sortLabel')}>
              {(['forYou', 'listOrder'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={sort === value}
                  onClick={() => setSort(value)}
                  className={`min-h-10 rounded-md px-3 text-subtle font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600 ${
                    sort === value ? 'bg-ginshu-100 text-ginshu-700' : 'text-ash-700 hover:bg-ash-200'
                  }`}
                  data-testid={`list-sort-${value}`}
                >
                  {value === 'forYou' ? t('forYou') : t(isMenu ? 'menuOrder' : 'leftToRight')}
                </button>
              ))}
            </div>
          )}
          {chips.map((chip) => {
            const on = filters.includes(chip)
            return (
              <button
                key={chip}
                type="button"
                aria-pressed={on}
                onClick={() => setFilters(on ? filters.filter((f) => f !== chip) : [...filters, chip])}
                className={`min-h-10 rounded-full border px-3.5 text-subtle transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600 ${
                  on ? 'border-ginshu-400 bg-ginshu-100 text-ginshu-700' : 'border-ash-300 text-ink hover:bg-ash-200'
                }`}
                data-testid={`list-chip-${chip}`}
              >
                {chip === 'warm' ? t('goodWarm') : chip === 'new' ? t('newToMe') : t('under', { price: price(cheap!) ?? '' })}
              </button>
            )
          })}
        </div>
      )}

      {shown.length > 0 ? (
        <ol className="flex flex-col" data-testid="list-rows">
          {shown.map((row, i) => (
            <ListRowItem
              key={row.brandId}
              row={row}
              rank={result.ranked && sort === 'forYou' ? i + 1 : (row.lines[0]?.index ?? i) + 1}
              top={result.ranked && sort === 'forYou' && i === 0 && filters.length === 0 && row.fit !== null}
              isMenu={isMenu}
              price={price}
            />
          ))}
        </ol>
      ) : (
        result.rows.length > 0 && (
          <p className="text-subtle text-ash-700" data-testid="list-filtered-empty">
            {t('noneForFilters')}
          </p>
        )
      )}

      {result.unmatched.length > 0 && (
        <div className="flex flex-col" data-testid="list-unmatched">
          <span className="text-section-label uppercase text-ash-600">
            {t('couldntMatch', { count: result.unmatched.length })}
          </span>
          <ul className="flex flex-col" role="list">
            {result.unmatched.map((line) => (
              <li
                key={line.index}
                className="flex flex-wrap items-center gap-x-2 border-b border-divider py-1"
                data-testid="list-unmatched-row"
              >
                <Question size={18} aria-hidden="true" className="shrink-0 text-ash-600" />
                <span className="min-w-0 flex-1 text-subtle text-ink">
                  <span lang="ja">{line.printed}</span>
                  {price(line.price) && <span className="text-ash-600"> · {price(line.price)}</span>}
                </span>
                <Link
                  href={{ pathname: '/search', query: { q: line.query } }}
                  className="flex min-h-11 items-center gap-1.5 rounded-md px-2 text-subtle font-medium text-ginshu-700 transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
                  data-testid="list-unmatched-search"
                >
                  <MagnifyingGlass size={16} aria-hidden="true" />
                  {t('search')}
                </Link>
                <AddListLineYourself printed={line.printed} label={t('addIt')} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.unreadableCount > 0 && (
        <div className="flex items-start gap-3 border-b border-divider py-3" data-testid="list-unreadable">
          <EyeSlash size={20} aria-hidden="true" className="mt-0.5 shrink-0 text-ash-600" />
          <div className="flex flex-col gap-0.5">
            <span className="text-card-heading font-medium text-ink">
              {t(isMenu ? 'linesUnread' : 'bottlesUnread', { count: result.unreadableCount })}
            </span>
            <span className="text-subtle leading-normal text-ash-700">{t(isMenu ? 'linesUnreadHint' : 'bottlesUnreadHint')}</span>
          </div>
        </div>
      )}

      {result.notSake.length > 0 && <NotSakeGroup lines={result.notSake} price={price} />}

    </section>
  )
}

/** The top bar: back · "From your photo · Menu · 8 sakes" · ghost "Retake". */
function ListBar({ title, onBack, onRetake }: { title: string; onBack: () => void; onRetake: () => void }) {
  const t = useTranslations('listResults')
  return (
    <div className="flex min-h-11 items-center gap-2" data-testid="list-bar">
      <button
        type="button"
        onClick={onBack}
        aria-label={t('back')}
        className="-ml-2 flex size-11 shrink-0 items-center justify-center rounded-md text-ink transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
        data-testid="list-back"
      >
        <ArrowLeft size={20} aria-hidden="true" />
      </button>
      <span className="min-w-0 flex-1 truncate text-subtle text-ash-600" data-testid="list-bar-title">
        {title}
      </span>
      <button
        type="button"
        onClick={onRetake}
        className="-mr-2 flex min-h-11 items-center gap-1.5 rounded-md px-2 text-subtle font-medium text-ginshu-700 transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
        data-testid="list-retake"
      >
        <CameraRotate size={16} aria-hidden="true" />
        {t('retake')}
      </button>
    </div>
  )
}

/** §7 (76): the screen opens at once in a reading state while the list is read. */
export function ListReading({ kind, onBack, onRetake }: { kind: 'menu' | 'shelf'; onBack: () => void; onRetake: () => void }) {
  const t = useTranslations('listResults')
  return (
    <section className="flex flex-col gap-4 px-5 py-5" data-testid="list-reading" aria-busy="true">
      <ListBar title={t('barReading', { kind })} onBack={onBack} onRetake={onRetake} />
      <div className="flex flex-col gap-1.5">
        <h2 className="text-title font-medium text-ink">{t(kind === 'menu' ? 'readingMenu' : 'readingShelf')}</h2>
        <p className="text-subtle leading-normal text-ash-700">{t('readingBody')}</p>
      </div>
      <ul className="flex flex-col" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex flex-col gap-2 border-b border-divider py-4">
            <span className="h-3.5 w-3/5 animate-pulse rounded bg-ash-200" />
            <span className="h-2.5 w-2/5 animate-pulse rounded bg-ash-200" />
            <span className="h-2.5 w-4/5 animate-pulse rounded bg-ash-200" />
          </li>
        ))}
      </ul>
    </section>
  )
}

/** A failed or refused read, on the same bar, with the way back. */
export function ListProblem({
  title,
  body,
  onBack,
  onRetake,
}: {
  title: string
  body: string
  onBack: () => void
  onRetake: () => void
}) {
  const t = useTranslations('listResults')
  return (
    <section className="flex flex-col gap-4 px-5 py-5" data-testid="list-problem">
      <ListBar title={t('barProblem')} onBack={onBack} onRetake={onRetake} />
      <h2 className="text-title font-medium text-ink">{title}</h2>
      <p className="text-subtle leading-normal text-ash-700">{body}</p>
    </section>
  )
}

function ListRowItem({
  row,
  rank,
  top,
  isMenu,
  price,
}: {
  row: ListRow
  rank: number
  top: boolean
  isMenu: boolean
  price: (amount: number | undefined) => string | null
}) {
  const t = useTranslations('listResults')
  const single = row.lines.length === 1 ? row.lines[0] : null
  const craft = row.lines.some((l) => l.craft)
  const title = [row.nameRomaji ?? row.nameKanji, single?.productRomaji].filter(Boolean).join(' ')
  const asRead = single ? whatWasRead(single) : { kanji: row.nameKanji, rest: '' }
  const warm = row.lines.some((l) => l.warm)
  const partly = row.lines.some((l) => l.partlyRead)

  return (
    <li className="flex flex-col border-b border-divider" data-testid="list-row" data-brand-id={row.brandId}>
      <NextLink
        href={row.sakeHref}
        className="flex gap-3 py-4 transition-colors hover:bg-ash-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
      >
        <span className="flex w-5 shrink-0 flex-col items-center gap-1.5">
          <span className={`text-card-heading font-medium ${top ? 'text-ginshu-600' : 'text-ash-600'}`} data-testid="list-row-rank">
            {rank}
          </span>
          {top && <span className="h-5 w-0.5 rounded bg-ginshu-600" aria-hidden="true" />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-card-heading font-medium text-ink" data-testid="list-row-name">
              {title}
              {craft && <span className="text-meta font-normal text-ash-700"> {t('craft')}</span>}
            </span>
            {isMenu && single && price(single.price) && (
              <span className="shrink-0 text-subtle text-ink" data-testid="list-row-price">
                {price(single.price)}
              </span>
            )}
          </span>
          <span className="flex items-center justify-between gap-3">
            <span className="min-w-0 text-meta text-ash-700">
              <span lang="ja">{asRead.kanji}</span>
              {asRead.rest && <> · {asRead.rest}</>}
            </span>
            {row.chart && <FlavorShape chart={row.chart} />}
          </span>
          <span className="text-subtle leading-normal text-ink" data-testid="list-row-reason">
            <Reason reason={row.reason} />
          </span>
          <span className="flex flex-wrap gap-1.5 pt-0.5">
            {row.fit && (
              <Tag accent={row.fit === 'close'} testId="list-row-fit">
                {t(`fit.${row.fit}`)}
              </Tag>
            )}
            {row.yourRating !== null && <Tag testId="list-row-yours">{t('yours', { rating: row.yourRating })}</Tag>}
            {isMenu && warm && <Tag testId="list-row-warm">{t('goodWarm')}</Tag>}
            {partly && (
              <Tag outline testId="list-row-partly">
                {t('partlyRead')}
              </Tag>
            )}
          </span>
        </span>
      </NextLink>
      {row.lines.length > 1 && (
        // C10: one row for the sake, its bottlings as printed under it.
        <div className="flex flex-col pb-3 pl-[34px]" data-testid="list-row-bottlings">
          <span className="pb-1 text-section-label tracking-normal text-ash-600">
            {t(isMenu ? 'bottlingsOnList' : 'bottlingsOnShelf', { count: row.lines.length })}
          </span>
          {row.lines.map((line) => (
            <NextLink
              key={line.index}
              href={row.sakeHref}
              className="flex min-h-11 items-center gap-3 border-t border-divider text-subtle text-ink transition-colors hover:bg-ash-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
              data-testid="list-row-bottling"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span lang="ja">{line.printed}</span>
                {/* What the printed name means, for a visitor who cannot read it. */}
                {bottlingWords(line) && <span className="text-meta text-ash-600">{bottlingWords(line)}</span>}
              </span>
              {isMenu && price(line.price) && <span className="shrink-0">{price(line.price)}</span>}
              <CaretRight size={14} aria-hidden="true" className="shrink-0 text-ash-500" />
            </NextLink>
          ))}
        </div>
      )}
    </li>
  )
}

/** "Junmai Ginjō · Nama · Genshu": a bottling's grade and every style read, in words. */
function bottlingWords(line: ListLine): string {
  return [...(line.grade ? [gradeLabel(line.grade)] : []), ...(line.styles ?? []).map(styleLabel)].join(' · ')
}

function ReadByAiBadge() {
  const tBadge = useTranslations('provenance.badge.llmExtracted')
  const tSheet = useTranslations('provenance.sheet')
  return (
    <ProvenanceBadgeView
      kind={resolveBadgeKind('llm_extracted')}
      label={tBadge('label')}
      explanation={tBadge('explanation')}
      sheetTitle={tBadge('sheetTitle')}
      closeLabel={tSheet('closeLabel')}
      id="list-read-badge"
    />
  )
}

/** "秋鹿 奥鹿 · Junmai · aged": the name as printed, then the grade and styles in words. */
function whatWasRead(line: ListLine): { kanji: string; rest: string } {
  const rest = [...(line.grade ? [gradeLabel(line.grade)] : []), ...(line.styles ?? []).slice(0, 2).map(styleLabel)]
  return { kanji: line.nameAsPrinted || line.printed, rest: rest.join(' · ') }
}

function Reason({ reason }: { reason: ListReason }) {
  const t = useTranslations('listResults.reason')
  const tAxis = useTranslations('flavorAxis')
  if (reason.kind === 'no_chart') return <>{t('noChart')}</>
  const [a, b] = reason.axes
  const shape = t('shape', { first: tAxis(`${a}.label`), second: tAxis(`${b}.label`).toLowerCase() })
  switch (reason.kind) {
    case 'tasted':
      return <>{t('tasted', { rating: reason.rating, shape })}</>
    case 'like':
      return <>{t('like', { shape, name: reason.like.name, rating: reason.like.rating })}</>
    case 'unusual':
      return <>{t('unusual', { shape })}</>
    case 'axes':
      return <>{t('axes', { shape })}</>
  }
}

/** Six 4px bars, 20px tall, in the chart's axis order; the values are the title. */
function FlavorShape({ chart }: { chart: FlavorChart }) {
  const tAxis = useTranslations('flavorAxis')
  const label = FLAVOR_AXES.map((axis: FlavorAxis) => `${tAxis(`${axis}.label`)} ${Math.round(chart[axis] * 100)}`).join(', ')
  return (
    <span className="flex h-5 shrink-0 items-end gap-0.5" role="img" aria-label={label} title={label} data-testid="list-row-shape">
      {FLAVOR_AXES.map((axis) => (
        <span
          key={axis}
          className="w-1 rounded-[1px] bg-ginshu-500"
          style={{ height: `${Math.max(2, Math.round(chart[axis] * 20))}px` }}
        />
      ))}
    </span>
  )
}

function Tag({
  children,
  accent = false,
  outline = false,
  testId,
}: {
  children: ReactNode
  accent?: boolean
  outline?: boolean
  testId: string
}) {
  const tone = accent
    ? 'bg-ginshu-100 text-ginshu-700'
    : outline
      ? 'border border-ash-400 text-ink'
      : 'bg-ash-200 text-ink'
  return (
    <span className={`rounded-md px-2 py-0.5 text-meta ${tone}`} data-testid={testId}>
      {children}
    </span>
  )
}

/** §7 (82): "How this is ranked", the §16 info-sheet pattern. */
function HowThisIsRanked() {
  const t = useTranslations('listResults')
  const tSheet = useTranslations('provenance.sheet')
  return (
    <Sheet>
      <SheetTrigger
        render={
          <button
            type="button"
            aria-label={t('howRankedTitle')}
            className="inline-flex size-6 items-center justify-center rounded-full align-middle text-ash-600 transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
            data-testid="list-how-ranked"
          />
        }
      >
        <Info size={16} aria-hidden="true" />
      </SheetTrigger>
      <InfoSheetPanel title={t('howRankedTitle')} closeLabel={tSheet('closeLabel')} id="list-how-ranked">
        <span className="block">{t('howRankedBody1')}</span>
        <span className="mt-2 block">{t('howRankedBody2')}</span>
      </InfoSheetPanel>
    </Sheet>
  )
}

/** C6: greyed, collapsed, no tap; the Learn entry at the end. */
function NotSakeGroup({
  lines,
  price,
}: {
  lines: ListResult['notSake']
  price: (amount: number | undefined) => string | null
}) {
  const t = useTranslations('listResults')
  const tDrink = useTranslations('listResults.drink')
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col" data-testid="list-not-sake">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex min-h-11 items-center gap-3 border-b border-divider text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
        data-testid="list-not-sake-toggle"
      >
        <Drop size={18} aria-hidden="true" className="shrink-0 text-ash-600" />
        <span className="flex-1 text-section-label uppercase text-ash-600">{t('notSake', { count: lines.length })}</span>
        {open ? <CaretUp size={16} aria-hidden="true" className="text-ash-600" /> : <CaretDown size={16} aria-hidden="true" className="text-ash-600" />}
      </button>
      {open && (
        <>
          <ul className="flex flex-col" role="list">
            {lines.map((line) => (
              <li key={line.index} className="flex min-h-11 items-center gap-3 border-b border-divider text-subtle text-ash-600">
                <span className="min-w-0 flex-1">
                  <span lang="ja">{line.printed}</span> · {tDrink(line.drink)}
                </span>
                {price(line.price) && <span className="shrink-0">{price(line.price)}</span>}
              </li>
            ))}
          </ul>
          <Link
            href={{ pathname: '/learn/[slug]', params: { slug: 'other-japanese-drinks' } }}
            className="flex min-h-11 w-fit items-center gap-2 text-subtle font-medium text-ginshu-700 hover:text-ginshu-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
            data-testid="list-other-drinks"
          >
            <BookOpen size={16} aria-hidden="true" />
            {t('otherDrinks')}
          </Link>
        </>
      )}
    </div>
  )
}

/** "Order the Akishika": the first word of the top sake's name. */
function firstWord(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name
}

function formatPrice(amount: number, currency: ListResult['currency'], locale: string): string {
  if (!currency || currency === 'other') return new Intl.NumberFormat(locale).format(amount)
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'JPY' ? 0 : 2,
    minimumFractionDigits: currency === 'JPY' || Number.isInteger(amount) ? 0 : 2,
  }).format(amount)
}
