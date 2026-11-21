'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  BowlFood,
  BowlSteam,
  Cake,
  Cheese,
  CookingPot,
  Fish,
  FishSimple,
  ForkKnife,
  Pepper,
  Shrimp,
} from '@phosphor-icons/react/dist/ssr'
import { InfoSheet } from '@/components/ui/info-sheet'
import { PairingSourceLinks } from '@/components/sake/pairing-source-links'
import { DISH_GROUPS, type DishGroupId, rowsForDish, sortForDish } from '@/lib/pairing/bottles-for-dish'
import { pairingRow } from '@/lib/pairing/pairing-table'
import type { Pairing } from '@/lib/pairing/resolve-pairing'
import { gradeLabel } from '@/lib/scan/read-bottling'
import { keepBracketsTogether } from '@/lib/text/keep-brackets-together'
import { cn } from '@/lib/utils'

const DISH_ICON: Record<DishGroupId, typeof Fish> = {
  rawSeafood: Shrimp,
  friedFish: Fish,
  grilledEel: FishSimple,
  lightChilled: BowlFood,
  dashiSimmered: BowlSteam,
  richMeat: CookingPot,
  spicy: Pepper,
  cheese: Cheese,
  sweets: Cake,
}

/** One cellar row, drawn on the server: its top (name, size, kanji) and its bottom (state line, actions). */
export interface DishPickRow {
  key: string
  head: ReactNode
  tail: ReactNode
  /** What "Goes with" says for this bottle, read once on the server; `null` when the table places it nowhere. */
  pairing: Pairing | null
}

type Shown =
  | { state: 'plain'; row: DishPickRow }
  | { state: 'match'; row: DishPickRow; pairing: Pairing; foods: string[] }
  | { state: 'other'; row: DishPickRow; pairing: Pairing }
  | { state: 'unplaceable'; row: DishPickRow }

/**
 * §11 Cellar with "Pick for a dish" (design question AG, layout C — the
 * maintainer's pick). No screen of its own: a control beside the summary
 * opens a strip of the nine dish groups, and tapping one re-sorts this same
 * list in place — the bottles the pairing table puts with that dish first,
 * each with an accent edge and a line on what it goes with and what placed
 * it; the rest dimmed, with a word on why. Tapping the chip again, or
 * "Clear", puts the cellar back in its own order.
 *
 * Every bottle's pairing is read once on the server (`pairingOf`, as on its
 * page), so a tap re-sorts here with no request: the feedback is the list
 * itself, in the same frame. The dish is mirrored into `?dish=` so a reload
 * keeps it, and goes nowhere else — nothing stored, sent or counted.
 *
 * Rows arrive in the cellar's own order (drink soon, other open, sealed);
 * `sortForDish` keeps that order inside each group.
 */
export function CellarDishPick({
  rows,
  summary,
  initialDish,
}: {
  rows: readonly DishPickRow[]
  /** "{bottles} bottles · {open} open". */
  summary: string
  initialDish: DishGroupId | null
}) {
  const t = useTranslations('cellar.dishPick')
  const tPair = useTranslations('pairings')
  const tSheet = useTranslations('provenance.sheet')
  const [dish, setDish] = useState<DishGroupId | null>(initialDish)
  const [open, setOpen] = useState(initialDish !== null)
  // The control that was tapped goes away with the tap ("Pick for a dish"
  // becomes "Clear"), so focus moves to what replaced it, not to the page.
  const controls = useRef<HTMLElement>(null)
  const focusAfterRender = (selector: string) =>
    requestAnimationFrame(() => controls.current?.querySelector<HTMLElement>(selector)?.focus())

  // A dish named in the URL may sit past the strip's right edge: bring its
  // chip into view once, so the visitor sees which one is on.
  useEffect(() => {
    if (initialDish === null) return
    controls.current
      ?.querySelector<HTMLElement>(`[data-testid="dish-chip-${initialDish}"]`)
      ?.scrollIntoView?.({ block: 'nearest', inline: 'center' })
  }, [initialDish])

  const choose = (next: DishGroupId | null) => {
    setDish(next)
    const url = new URL(window.location.href)
    if (next) url.searchParams.set('dish', next)
    else url.searchParams.delete('dish')
    window.history.replaceState(window.history.state, '', url)
  }
  const kind = (rowId: string) => keepBracketsTogether(tPair(`rows.${rowId}.kind`))

  const pick = dish ? sortForDish(dish, rows.map((row) => ({ bottle: row, pairing: row.pairing }))) : null
  const shown: Shown[] = pick
    ? [
        ...pick.matches.map((m) => ({ state: 'match' as const, row: m.bottle, pairing: m.pairing, foods: m.foods })),
        ...pick.others.map((o) => ({ state: 'other' as const, row: o.bottle, pairing: o.pairing })),
        ...pick.unplaceable.map((u) => ({ state: 'unplaceable' as const, row: u.bottle })),
      ]
    : rows.map((row) => ({ state: 'plain' as const, row }))
  const dishRows = dish ? rowsForDish(dish) : []
  const sources = [...new Map(dishRows.flatMap((id) => pairingRow(id).sources).map((s) => [s.url, s])).values()]

  return (
    <section ref={controls} className="flex flex-col" data-testid="cellar-list">
      <div className="flex items-center justify-between gap-3 pb-2">
        <p className="text-meta text-ash-700" data-testid="cellar-summary">
          {summary}
        </p>
        {open ? (
          <button
            type="button"
            onClick={() => {
              choose(null)
              setOpen(false)
              focusAfterRender('[data-testid="dish-pick-open"]')
            }}
            className="min-h-9 shrink-0 rounded-lg px-2 text-subtle text-ginshu-700 transition-colors hover:bg-ginshu-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
            data-testid="dish-pick-clear"
          >
            {t('clear')}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setOpen(true)
              focusAfterRender('[data-testid="dish-chips"] button')
            }}
            className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg border border-ginshu-400 px-3 text-subtle font-medium text-ginshu-700 transition-colors hover:bg-ginshu-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
            data-testid="dish-pick-open"
          >
            <ForkKnife size={15} aria-hidden="true" />
            {t('entry')}
          </button>
        )}
      </div>

      {open && (
        <div className="flex flex-col gap-2 pb-3" data-testid="dish-pick">
          <div
            className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]"
            role="group"
            aria-label={t('dishesLabel')}
            data-testid="dish-chips"
          >
            {DISH_GROUPS.map(({ id }) => {
              const Icon = DISH_ICON[id]
              const on = dish === id
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => choose(on ? null : id)}
                  className={cn(
                    'flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-subtle whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600',
                    on ? 'border-ginshu-500 bg-ginshu-100 text-ginshu-700' : 'border-ash-300 text-ink hover:bg-ash-200',
                  )}
                  data-testid={`dish-chip-${id}`}
                >
                  <Icon size={15} aria-hidden="true" />
                  {tPair(`dishes.${id}`)}
                </button>
              )
            })}
          </div>
          <p className="text-meta text-ash-700" aria-live="polite" data-testid="dish-pick-status">
            {pick ? t('matchCount', { count: pick.matches.length }) : t('choose')}
          </p>
          {dish && (
            <InfoSheet
              id="cellar-dish-pick"
              caveat={t('caveat')}
              triggerLabel={tPair('sheet.triggerLabel')}
              title={tPair('sheet.title')}
              closeLabel={tSheet('closeLabel')}
            >
              <p className="mb-3">{keepBracketsTogether(tPair('sheet.intro'))}</p>
              <p className="mb-3">{t('sheetHow')}</p>
              <p className="mb-3">{tPair('sheet.startingPoint')}</p>
              <p className="mb-1 font-medium text-ink">{tPair('sheet.sources')}</p>
              <PairingSourceLinks sources={sources} />
            </InfoSheet>
          )}
          {pick && pick.matches.length === 0 && (
            <section className="flex flex-col gap-1.5 rounded-xl border border-divider px-4 py-4" data-testid="dish-pick-none">
              <h3 className="text-card-heading font-medium text-ink">{t('noneTitle')}</h3>
              <p className="text-subtle text-ash-600">{t('noneBody', { kinds: dishRows.map(kind).join(t('kindsJoin')) })}</p>
            </section>
          )}
        </div>
      )}

      <ul className="flex flex-col" role="list">
        {shown.map((item) => {
          const dimmed = item.state === 'other' || item.state === 'unplaceable'
          return (
            <li
              key={item.row.key}
              className={cn(
                'flex gap-3 border-b border-divider py-3',
                item.state === 'match' && '-ml-3 border-l-2 border-l-ginshu-500 pl-2.5',
              )}
              data-testid="cellar-row"
              data-row-key={item.row.key}
              data-dish={item.state}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className={cn('flex flex-col gap-0.5', dimmed && 'opacity-60')}>{item.row.head}</span>
                {item.state === 'match' && <MatchLines pairing={item.pairing} foods={item.foods} kind={kind} />}
                {item.state === 'other' && (
                  <span className="text-meta text-ash-700" data-testid="dish-pick-why">
                    {t('otherDishes', { kind: kind(item.pairing.row.id) })}
                  </span>
                )}
                {item.state === 'unplaceable' && (
                  <span className="text-meta text-ash-700" data-testid="dish-pick-why">
                    {t('noPairing')}
                  </span>
                )}
                {item.row.tail}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** "Often served with: …" and what placed the bottle — a style, a ginjo grade, or the chart (Sakenowa). */
function MatchLines({ pairing, foods, kind }: { pairing: Pairing; foods: string[]; kind: (rowId: string) => string }) {
  const t = useTranslations('cellar.dishPick')
  const tPair = useTranslations('pairings')
  const rowId = pairing.row.id
  return (
    <>
      <span className="text-body text-ink" data-testid="dish-pick-food">
        {t('food', { food: foods.map((food) => tPair(`rows.${rowId}.${food}.name`)).join(' · ') })}
      </span>
      <span className="text-meta text-ash-700" data-testid="dish-pick-basis" data-source={pairing.source}>
        {t(`basis.${pairing.basis}`, { grade: pairing.grade ? gradeLabel(pairing.grade) : '' })} ·{' '}
        {t('kindFor', { kind: kind(rowId) })}
      </span>
    </>
  )
}
