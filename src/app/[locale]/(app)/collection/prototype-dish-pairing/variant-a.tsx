'use client'

/**
 * PROTOTYPE variant A — "Chips and groups". A screen of its own: every dish
 * kind as a chip at once, and under them the whole cellar in three groups —
 * often served with this, for other dishes, and the ones the table cannot
 * place. Nothing is folded away; the honesty is in plain view.
 */
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { DISH_GROUPS, type DishId, type ProtoBottle, pickForDish } from './pick-for-dish'
import {
  BasisLine,
  BottleName,
  DISH_ICON,
  EmptyCellar,
  FoodLine,
  FreshnessLine,
  NothingMatches,
  SectionLabel,
  ServeLine,
  SourcesCaveat,
  UnplacedReason,
  useKind,
} from './shared'
import { useDish } from './use-dish'

export function VariantA({ bottles, initialDish }: { bottles: ProtoBottle[]; initialDish: DishId | null }) {
  const t = useTranslations('prototypeDishPairing')
  const kind = useKind()
  const [dish, choose] = useDish(initialDish)
  if (bottles.length === 0) return <EmptyCellar />
  const pick = dish ? pickForDish(bottles, dish) : null

  return (
    <div className="flex flex-col" data-testid="proto-variant-a">
      <p className="max-w-prose text-subtle text-ash-600">{t('intro')}</p>
      <SectionLabel>{t('dishesLabel')}</SectionLabel>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('dishesLabel')}>
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
                'flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-subtle transition-colors',
                on ? 'border-ginshu-500 bg-ginshu-100 text-ginshu-700' : 'border-ash-300 text-ink hover:bg-ash-200',
              )}
            >
              <Icon size={15} aria-hidden="true" />
              {t(`dishes.${id}`)}
            </button>
          )
        })}
      </div>
      <div className="mt-3">
        <SourcesCaveat dish={dish} id="proto-a" />
      </div>

      {!pick ? (
        <p className="mt-6 text-subtle text-ash-600">{t('choose')}</p>
      ) : (
        <>
          <SectionLabel>{t('matchCount', { count: pick.matches.length })}</SectionLabel>
          {pick.matches.length === 0 ? (
            <NothingMatches dish={dish!} />
          ) : (
            <ul className="flex flex-col" role="list">
              {pick.matches.map(({ bottle, foods }) => (
                <li key={bottle.key} className="flex flex-col gap-1 border-b border-divider py-3">
                  <BottleName bottle={bottle} />
                  <FoodLine rowId={bottle.pairing!.rowId} foods={foods} />
                  <BasisLine bottle={bottle} />
                  <FreshnessLine bottle={bottle} />
                  <ServeLine rowId={bottle.pairing!.rowId} />
                </li>
              ))}
            </ul>
          )}

          {pick.elsewhere.length > 0 && (
            <>
              <SectionLabel>{t('groupElsewhere')}</SectionLabel>
              <ul className="flex flex-col" role="list">
                {pick.elsewhere.map((bottle) => (
                  <li key={bottle.key} className="flex flex-col gap-0.5 border-b border-divider py-2.5">
                    <BottleName bottle={bottle} />
                    <span className="text-meta text-ash-700">{kind(bottle.pairing!.rowId)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {pick.unplaced.length > 0 && (
            <>
              <SectionLabel>{t('groupUnplaced')}</SectionLabel>
              <ul className="flex flex-col" role="list">
                {pick.unplaced.map((bottle) => (
                  <li key={bottle.key} className="flex flex-col gap-0.5 border-b border-divider py-2.5">
                    <BottleName bottle={bottle} />
                    <UnplacedReason bottle={bottle} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  )
}
