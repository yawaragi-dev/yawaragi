'use client'

/**
 * PROTOTYPE variant C — "Inside the cellar list". No new screen: the Cellar
 * segment as it is, with "Pick for a dish" above the rows. Tapping it opens a
 * sideways-scrolling strip of dish chips; choosing one re-sorts the same list
 * in place — matches to the top with what they go with, the rest dimmed with
 * a word on why. "Clear" puts the cellar back as it was.
 */
import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ForkKnife, Stack } from '@phosphor-icons/react/dist/ssr'
import { cn } from '@/lib/utils'
import { DISH_GROUPS, type DishId, type ProtoBottle, pickForDish } from './pick-for-dish'
import { BasisLine, BottleName, DISH_ICON, FoodLine, FreshnessLine, NothingMatches, ServeLine, SourcesCaveat, useKind } from './shared'
import { useDish } from './use-dish'

export function VariantC({ bottles, initialDish }: { bottles: ProtoBottle[]; initialDish: DishId | null }) {
  const t = useTranslations('prototypeDishPairing')
  const tCellar = useTranslations('cellar')
  const kind = useKind()
  const [dish, choose] = useDish(initialDish)
  const [open, setOpen] = useState(initialDish !== null)

  if (bottles.length === 0) {
    // The cellar's own empty state; no "Pick for a dish" when there is nothing to pick from.
    return (
      <section className="flex flex-col items-center gap-2.5 px-2.5 py-14 text-center" data-testid="proto-variant-c">
        <Stack size={32} className="text-ash-500" aria-hidden="true" />
        <h2 className="text-md-alt font-medium text-ink">{tCellar('emptyHeading')}</h2>
        <p className="max-w-60 text-subtle text-ash-600">{tCellar('emptyBody')}</p>
      </section>
    )
  }

  const total = bottles.reduce((n, b) => n + b.count, 0)
  const openCount = bottles.filter((b) => b.freshness.kind === 'open').length
  const pick = dish ? pickForDish(bottles, dish) : null
  const rows: { bottle: ProtoBottle; foods?: string[]; state: 'plain' | 'match' | 'elsewhere' | 'unplaced' }[] = pick
    ? [
        ...pick.matches.map((m) => ({ bottle: m.bottle, foods: m.foods, state: 'match' as const })),
        ...pick.elsewhere.map((bottle) => ({ bottle, state: 'elsewhere' as const })),
        ...pick.unplaced.map((bottle) => ({ bottle, state: 'unplaced' as const })),
      ]
    : [...bottles].sort((a, b) => a.cellarOrder - b.cellarOrder).map((bottle) => ({ bottle, state: 'plain' as const }))

  return (
    <section className="flex flex-col" data-testid="proto-variant-c">
      <div className="flex items-center justify-between gap-3 pb-2">
        <p className="text-meta text-ash-700">{tCellar('summary', { bottles: total, open: openCount })}</p>
        {open ? (
          <button
            type="button"
            onClick={() => {
              choose(null)
              setOpen(false)
            }}
            className="min-h-9 px-1 text-subtle text-ginshu-700"
          >
            {t('clear')}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex min-h-9 items-center gap-1.5 rounded-lg border border-ginshu-400 px-3 text-subtle font-medium text-ginshu-700 transition-colors hover:bg-ginshu-100"
          >
            <ForkKnife size={15} aria-hidden="true" />
            {t('entry')}
          </button>
        )}
      </div>

      {open && (
        <div className="flex flex-col gap-2 pb-3">
          <div
            className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]"
            role="group"
            aria-label={t('dishesLabel')}
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
                    'flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-subtle whitespace-nowrap transition-colors',
                    on ? 'border-ginshu-500 bg-ginshu-100 text-ginshu-700' : 'border-ash-300 text-ink hover:bg-ash-200',
                  )}
                >
                  <Icon size={15} aria-hidden="true" />
                  {t(`dishes.${id}`)}
                </button>
              )
            })}
          </div>
          {dish ? <SourcesCaveat dish={dish} id="proto-c" /> : <p className="text-meta text-ash-700">{t('choose')}</p>}
          {pick && pick.matches.length === 0 && <NothingMatches dish={dish!} />}
        </div>
      )}

      <ul className="flex flex-col" role="list">
        {rows.map(({ bottle, foods, state }) => (
          <li
            key={bottle.key}
            className={cn(
              'flex flex-col gap-0.5 border-b border-divider py-3',
              state === 'match' && '-ml-3 border-l-2 border-l-ginshu-500 pl-2.5',
              (state === 'elsewhere' || state === 'unplaced') && 'opacity-60',
            )}
          >
            <BottleName bottle={bottle} />
            {state === 'match' && (
              <>
                <span className="text-meta font-medium text-ginshu-700">{t('matchTag')}</span>
                <FoodLine rowId={bottle.pairing!.rowId} foods={foods!} />
                <BasisLine bottle={bottle} />
              </>
            )}
            <FreshnessLine bottle={bottle} />
            {state === 'match' && <ServeLine rowId={bottle.pairing!.rowId} />}
            {state === 'elsewhere' && (
              <span className="text-meta text-ash-700">
                {t('notForThis')} · {kind(bottle.pairing!.rowId)}
              </span>
            )}
            {state === 'unplaced' && <span className="text-meta text-ash-700">{t('noPairing')}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}
