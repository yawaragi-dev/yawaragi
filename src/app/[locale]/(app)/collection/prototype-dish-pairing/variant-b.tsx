'use client'

/**
 * PROTOTYPE variant B — "One question, one answer". Two steps on one screen.
 * First only the question: a tall list of dish kinds, each naming the foods
 * it stands for. Then one bottle to start with, large, with everything the
 * table says about it; the rest of the matches compact under it; and the
 * other bottles folded into two disclosures at the end.
 */
import { useTranslations } from 'next-intl'
import { CaretRight, X } from '@phosphor-icons/react/dist/ssr'
import { PAIRING_ROWS } from '@/lib/pairing/pairing-table'
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

/** The table's food names for a dish kind, from whichever row has them. */
function useDishFoods() {
  const tPair = useTranslations('pairings')
  const rowOf = (food: string) => PAIRING_ROWS.find((row) => row.foods.includes(food))!.id
  return (foods: readonly string[]) => foods.map((food) => tPair(`rows.${rowOf(food)}.${food}.name`)).join(' · ')
}

export function VariantB({ bottles, initialDish }: { bottles: ProtoBottle[]; initialDish: DishId | null }) {
  const t = useTranslations('prototypeDishPairing')
  const kind = useKind()
  const dishFoods = useDishFoods()
  const [dish, choose] = useDish(initialDish)
  if (bottles.length === 0) return <EmptyCellar />

  if (!dish) {
    return (
      <div className="flex flex-col" data-testid="proto-variant-b">
        <h2 className="text-title font-medium text-ink">{t('dishesLabel')}</h2>
        <p className="mt-1 max-w-prose text-subtle text-ash-600">{t('intro')}</p>
        <ul className="mt-4 flex flex-col" role="list">
          {DISH_GROUPS.map(({ id, foods }) => {
            const Icon = DISH_ICON[id]
            return (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => choose(id)}
                  className="flex w-full items-center gap-3 border-b border-divider py-3.5 text-left transition-colors hover:bg-ash-200"
                >
                  <Icon size={22} aria-hidden="true" className="shrink-0 text-ginshu-600" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-card-heading font-medium text-ink">{t(`dishes.${id}`)}</span>
                    <span className="truncate text-meta text-ash-700">{dishFoods(foods)}</span>
                  </span>
                  <CaretRight size={16} aria-hidden="true" className="shrink-0 text-ash-500" />
                </button>
              </li>
            )
          })}
        </ul>
        <div className="mt-4">
          <SourcesCaveat dish={null} id="proto-b-list" />
        </div>
      </div>
    )
  }

  const pick = pickForDish(bottles, dish)
  const [first, ...rest] = pick.matches
  const Icon = DISH_ICON[dish]

  return (
    <div className="flex flex-col" data-testid="proto-variant-b">
      <button
        type="button"
        onClick={() => choose(null)}
        aria-label={t('changeDish')}
        className="flex w-fit items-center gap-2 rounded-full border border-ginshu-500 bg-ginshu-100 py-1.5 pr-2.5 pl-3 text-subtle text-ginshu-700"
      >
        <Icon size={15} aria-hidden="true" />
        {t(`dishes.${dish}`)}
        <X size={13} aria-hidden="true" />
      </button>

      {first ? (
        <>
          <SectionLabel>{t('startWith')}</SectionLabel>
          <article className="flex flex-col gap-2 rounded-xl border border-ash-300 bg-surface px-4 py-4">
            <BottleName bottle={first.bottle} size="hero" />
            <FreshnessLine bottle={first.bottle} />
            <span className="my-1 h-px bg-divider" aria-hidden="true" />
            <FoodLine rowId={first.bottle.pairing!.rowId} foods={first.foods} />
            <BasisLine bottle={first.bottle} />
            <ServeLine rowId={first.bottle.pairing!.rowId} />
          </article>
          <div className="mt-3">
            <SourcesCaveat dish={dish} id="proto-b" />
          </div>
          {rest.length > 0 && (
            <>
              <SectionLabel>{t('alsoFits')}</SectionLabel>
              <ul className="flex flex-col" role="list">
                {rest.map(({ bottle, foods }) => (
                  <li key={bottle.key} className="flex flex-col gap-0.5 border-b border-divider py-2.5">
                    <BottleName bottle={bottle} />
                    <span className="text-meta text-ash-700">
                      {kind(bottle.pairing!.rowId)}
                    </span>
                    <FoodLine rowId={bottle.pairing!.rowId} foods={foods} />
                    <FreshnessLine bottle={bottle} />
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      ) : (
        <div className="mt-5 flex flex-col gap-3">
          <NothingMatches dish={dish} />
          <SourcesCaveat dish={dish} id="proto-b" />
        </div>
      )}

      <div className="mt-6 flex flex-col gap-2">
        {pick.elsewhere.length > 0 && (
          <details className="rounded-xl border border-divider px-4 py-3">
            <summary className="cursor-pointer text-subtle text-ink">{t('showElsewhere', { count: pick.elsewhere.length })}</summary>
            <ul className="mt-2 flex flex-col" role="list">
              {pick.elsewhere.map((bottle) => (
                <li key={bottle.key} className="flex flex-col gap-0.5 py-2">
                  <BottleName bottle={bottle} />
                  <span className="text-meta text-ash-700">{kind(bottle.pairing!.rowId)}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
        {pick.unplaced.length > 0 && (
          <details className="rounded-xl border border-divider px-4 py-3">
            <summary className="cursor-pointer text-subtle text-ink">{t('showUnplaced', { count: pick.unplaced.length })}</summary>
            <ul className="mt-2 flex flex-col" role="list">
              {pick.unplaced.map((bottle) => (
                <li key={bottle.key} className="flex flex-col gap-0.5 py-2">
                  <BottleName bottle={bottle} />
                  <UnplacedReason bottle={bottle} />
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  )
}
