import { CaretRight, ClockCounterClockwise } from '@phosphor-icons/react/dist/ssr'
import { getFormatter, getTranslations } from 'next-intl/server'
import { HadBottleRow } from '@/components/collection/had-bottle-row'
import { Link } from '@/i18n/navigation'
import type { HadBottle } from '@/lib/collection/bottles-had'

/**
 * §11's way to the bottles no longer in the cellar (design v1.10, AB6; 131):
 * the last row under the cellar, shown once a bottle has left it.
 */
export async function BottlesHadRow() {
  const t = await getTranslations('bottlesHad')
  return (
    <Link
      href="/collection/had"
      className="mt-3.5 flex min-h-[50px] w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-ash-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
      data-testid="bottles-had-row"
    >
      <ClockCounterClockwise size={19} aria-hidden="true" className="shrink-0 text-ash-600" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body text-ink">{t('title')}</span>
        <span className="mt-0.5 text-meta text-ash-600">{t('rowSub')}</span>
      </span>
      <CaretRight size={15} aria-hidden="true" className="shrink-0 text-ash-500" />
    </Link>
  )
}

/**
 * The list itself (AB6; 132): one row per bottle, newest first — name, kanji,
 * "Added {date} · Finished {date}" (or "Removed"). A row opens the page of
 * what the bottle was. **No total and no grouping by month**: a memory aid,
 * not a tally (X5). Each row's ⋯ takes that bottle off the list.
 */
export async function BottlesHadList({
  bottles,
  bottlingIds,
  readOnly,
  now,
}: {
  bottles: readonly HadBottle[]
  /** The visitor's bottlings that still exist; a deleted one's row opens its sake. */
  bottlingIds: ReadonlySet<string>
  readOnly: boolean
  now: number
}) {
  const t = await getTranslations('bottlesHad')
  const format = await getFormatter()
  const thisYear = new Date(now).getUTCFullYear()
  const date = (at: number) =>
    format.dateTime(new Date(at), {
      day: 'numeric',
      month: 'short',
      ...(new Date(at).getUTCFullYear() !== thisYear ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    })

  return (
    <ul className="flex flex-col" role="list" data-testid="bottles-had-list">
      {bottles.map((bottle) => {
        const name = bottle.thing.expression?.name ?? bottle.sake.nameRomaji ?? bottle.sake.nameKanji
        const kanji = name !== bottle.sake.nameKanji ? bottle.sake.nameKanji : null
        const ended = date(bottle.endedAt)
        const line =
          bottle.addedAt === null
            ? t(bottle.how, { ended })
            : t(bottle.how === 'finished' ? 'addedFinished' : 'addedRemoved', { added: date(bottle.addedAt), ended })
        const bottling = bottle.thing.expression
        const href =
          bottling && bottlingIds.has(bottling.id)
            ? ({ pathname: '/bottling/[id]', params: { id: bottling.id } } as const)
            : bottle.thing.brandId !== null
              ? ({ pathname: '/sake/[brandId]', params: { brandId: String(bottle.thing.brandId) } } as const)
              : null
        const body = (
          <>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span
                className="text-card-heading font-medium leading-snug text-ink"
                lang={bottling ? undefined : bottle.sake.nameRomaji ? 'en' : 'ja'}
                data-testid="bottles-had-name"
              >
                {name}
              </span>
              {kanji && (
                <span lang="ja" className="text-meta text-ash-600">
                  {kanji}
                </span>
              )}
              <span className="text-meta text-ash-700" data-testid="bottles-had-dates">
                {line}
              </span>
            </span>
            {href && <CaretRight size={13} aria-hidden="true" className="shrink-0 text-ash-500" />}
          </>
        )
        const cls = 'flex min-w-0 flex-1 items-center gap-2.5 py-3'
        return (
          <HadBottleRow key={bottle.id} bottleId={bottle.id} name={name} readOnly={readOnly}>
            {href ? (
              <Link
                href={href}
                className={`${cls} transition-colors hover:bg-ash-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600`}
              >
                {body}
              </Link>
            ) : (
              <span className={cls}>{body}</span>
            )}
          </HadBottleRow>
        )
      })}
    </ul>
  )
}
