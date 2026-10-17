import { getTranslations } from 'next-intl/server'
import {
  BowlFood,
  BowlSteam,
  Cake,
  Cheese,
  CookingPot,
  Cookie,
  Fish,
  ForkKnife,
  Leaf,
  Orange,
  Pepper,
  Shrimp,
} from '@phosphor-icons/react/dist/ssr'
import { BottleSection } from '@/components/sake/bottle-section'
import { InfoSheet } from '@/components/ui/info-sheet'
import type { Pairing } from '@/lib/pairing/resolve-pairing'
import { SERVING_TEMPERATURE_TERMS } from '@/lib/schemas/detailed-notes'

const FOOD_ICON: Record<string, typeof Fish> = {
  sashimi: Fish,
  crab: Shrimp,
  freshCheese: Cheese,
  oden: BowlSteam,
  sukiyaki: CookingPot,
  agedCheese: Cheese,
  coldTofu: BowlFood,
  oysters: Fish,
  friedFish: Fish,
  unagi: Fish,
  driedFruit: Orange,
  darkChocolate: Cookie,
  desserts: Cake,
  aperitif: ForkKnife,
  lightDishes: Leaf,
  spicyDishes: Pepper,
  washedRindCheese: Cheese,
}

/**
 * §9.7 "Goes with": up to three foods this kind of sake is often served with,
 * each with its reason, and how it is usually served (#336).
 *
 * Rendered only when `resolvePairing` found a row — no fallback sentence: the
 * design's "By its style, try it with grilled or savory dishes" names a style
 * we would not have (design question Q). The caveat line says where the row
 * came from — the bottling's style or grade (`manual_curation`), or the
 * line's flavor chart (`sakenowa_inferred`, a claim about every bottling of
 * the line) — and its sheet names the sources (§16 pattern).
 */
export async function GoesWith({ pairing, id }: { pairing: Pairing; id: string }) {
  const t = await getTranslations('pairings')
  const tSheet = await getTranslations('provenance.sheet')
  const { row, source } = pairing
  const kind = t(`rows.${row.id}.kind`)

  return (
    <BottleSection label={t('heading')} testId="bottle-pairings">
      <ul className="flex flex-col gap-3" role="list">
        {row.foods.map((food) => {
          const FoodIcon = FOOD_ICON[food] ?? ForkKnife
          return (
            <li key={food} className="flex items-start gap-3" data-testid="pairing-food">
              <FoodIcon size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-ginshu-600" />
              <span className="flex min-w-0 flex-col">
                <span className="text-body text-ink">{t(`rows.${row.id}.${food}.name`)}</span>
                <span className="text-meta text-ash-700">{t(`rows.${row.id}.${food}.reason`)}</span>
              </span>
            </li>
          )
        })}
      </ul>
      <p className="mt-3 text-meta text-ash-700" data-testid="pairing-serve">
        {t('serve', {
          temperatures: row.serve
            .map((key) => {
              const term = SERVING_TEMPERATURE_TERMS[key]
              return t('temperature', { kanji: term.kanji, romaji: term.romaji, degrees: term.degrees })
            })
            .join(t('or')),
        })}
      </p>
      <div className="mt-2" data-testid={`pairing-source-${source}`}>
        <InfoSheet
          id={`pairings-${id}`}
          caveat={source === 'sakenowa_inferred' ? t('caveatChart', { kind }) : t('caveatStyle', { kind })}
          triggerLabel={t('sheet.triggerLabel')}
          title={t('sheet.title')}
          closeLabel={tSheet('closeLabel')}
        >
          <p className="mb-3">{source === 'sakenowa_inferred' ? t('sheet.howChart', { kind }) : t('sheet.howStyle', { kind })}</p>
          <p className="mb-3">{t('sheet.startingPoint')}</p>
          <p className="mb-1 font-medium text-ink">{t('sheet.sources')}</p>
          <ul className="flex flex-col gap-1" role="list">
            {row.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-ginshu-700 underline underline-offset-4">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </InfoSheet>
      </div>
    </BottleSection>
  )
}
