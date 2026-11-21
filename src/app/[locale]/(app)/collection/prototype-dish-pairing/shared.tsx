'use client'

/**
 * PROTOTYPE — pieces every variant may use: the dish icons, a bottle's name,
 * its cellar state, what the table says about it, the sources sheet and the
 * two empty states. Variants are free to ignore any of it; the layouts are
 * meant to disagree.
 */
import { useTranslations } from 'next-intl'
import {
  BowlFood,
  BowlSteam,
  Cake,
  Cheese,
  CookingPot,
  Drop,
  Fish,
  FishSimple,
  HourglassMedium,
  LockSimple,
  Pepper,
  Shrimp,
  Stack,
  ThermometerSimple,
} from '@phosphor-icons/react/dist/ssr'
import { Link } from '@/i18n/navigation'
import { InfoSheet } from '@/components/ui/info-sheet'
import { PAIRING_ROWS, type PairingRowId, pairingRow } from '@/lib/pairing/pairing-table'
import { SERVING_TEMPERATURE_TERMS } from '@/lib/schemas/detailed-notes'
import { keepBracketsTogether } from '@/lib/text/keep-brackets-together'
import { cn } from '@/lib/utils'
import { type DishId, type ProtoBottle, rowsForDish } from './pick-for-dish'

export const DISH_ICON: Record<DishId, typeof Fish> = {
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

export function BottleName({ bottle, size = 'row' }: { bottle: ProtoBottle; size?: 'row' | 'hero' }) {
  const tCellar = useTranslations('cellar')
  return (
    <span className="flex min-w-0 flex-col">
      <span className="flex items-baseline gap-2">
        <span className={cn('min-w-0 flex-1 font-medium text-ink', size === 'hero' ? 'text-lg-alt' : 'text-card-heading')}>
          {bottle.name}
        </span>
        {bottle.sizeMl !== null && (
          <span className="shrink-0 text-meta text-ash-700">
            {tCellar('countBadgeSize', { count: bottle.count, ml: bottle.sizeMl })}
          </span>
        )}
      </span>
      {bottle.kanji && bottle.kanji !== bottle.name && (
        <span className="text-meta text-ash-600" lang="ja">
          {bottle.kanji}
        </span>
      )}
    </span>
  )
}

/** §11's state line, as the cellar writes it. */
export function FreshnessLine({ bottle }: { bottle: ProtoBottle }) {
  const t = useTranslations('cellar')
  const f = bottle.freshness
  const soon = f.kind === 'open' && f.drinkSoon
  const Icon = f.kind === 'unopened' ? LockSimple : soon ? HourglassMedium : Drop
  return (
    <span className={cn('flex items-center gap-1.5 text-meta', soon ? 'text-ginshu-700' : 'text-ash-700')}>
      <Icon size={14} aria-hidden="true" />
      {f.kind === 'unopened'
        ? t(bottle.nama ? 'unopenedNama' : 'unopened')
        : soon
          ? t('drinkSoon', { days: f.days })
          : t(bottle.nama ? 'openNama' : 'open', { days: f.days })}
    </span>
  )
}

export function useKind() {
  const t = useTranslations('pairings')
  return (rowId: string) => keepBracketsTogether(t(`rows.${rowId}.kind`))
}

/** "Often served with: Fried white fish" — the table's own food names. */
export function FoodLine({ rowId, foods }: { rowId: PairingRowId; foods: readonly string[] }) {
  const t = useTranslations('prototypeDishPairing')
  const tPair = useTranslations('pairings')
  return (
    <span className="text-body text-ink">
      {t('food', { food: foods.map((food) => tPair(`rows.${rowId}.${food}.name`)).join(' · ') })}
    </span>
  )
}

/** Where the row came from: style, grade or chart — the bottle's own caveat. */
export function BasisLine({ bottle }: { bottle: ProtoBottle }) {
  const t = useTranslations('prototypeDishPairing')
  const kind = useKind()
  if (!bottle.pairing) return null
  const { basis, grade, rowId, source } = bottle.pairing
  return (
    <span className="text-meta text-ash-700" data-source={source}>
      {t(`basis.${basis}`, { grade: grade ?? '' })} · {t('kindFor', { kind: kind(rowId) })}
    </span>
  )
}

export function ServeLine({ rowId }: { rowId: PairingRowId }) {
  const t = useTranslations('pairings')
  return (
    <span className="flex items-start gap-1.5 text-meta text-ash-700">
      <ThermometerSimple size={14} aria-hidden="true" className="mt-px shrink-0 text-ash-600" />
      <span>
        {t('serve', {
          temperatures: pairingRow(rowId)
            .serve.map((key) => {
              const term = SERVING_TEMPERATURE_TERMS[key]
              return t('temperature', { kanji: term.kanji, romaji: term.romaji, degrees: term.degrees })
            })
            .join(t('or')),
        })}
      </span>
    </span>
  )
}

export function UnplacedReason({ bottle }: { bottle: ProtoBottle }) {
  const t = useTranslations('prototypeDishPairing')
  return <span className="text-meta text-ash-700">{t(`unplaced.${bottle.unplacedReason ?? 'tooLittle'}`)}</span>
}

/** §16: the caveat line with ⓘ, and the sheet naming the sources of the rows this dish reaches. */
export function SourcesCaveat({ dish, id }: { dish: DishId | null; id: string }) {
  const t = useTranslations('prototypeDishPairing')
  const tPair = useTranslations('pairings')
  const tSheet = useTranslations('provenance.sheet')
  const rowIds = dish ? rowsForDish(PAIRING_ROWS, dish) : PAIRING_ROWS.map((r) => r.id)
  const sources = [...new Map(PAIRING_ROWS.filter((r) => rowIds.includes(r.id)).flatMap((r) => r.sources).map((s) => [s.url, s])).values()]
  return (
    <InfoSheet
      id={id}
      caveat={t('caveat')}
      triggerLabel={tPair('sheet.triggerLabel')}
      title={tPair('sheet.title')}
      closeLabel={tSheet('closeLabel')}
    >
      <p className="mb-3">{keepBracketsTogether(tPair('sheet.intro'))}</p>
      <p className="mb-3">{t('sheetHow')}</p>
      <p className="mb-3">{tPair('sheet.startingPoint')}</p>
      <p className="mb-1 font-medium text-ink">{tPair('sheet.sources')}</p>
      <ul className="flex flex-col gap-1" role="list">
        {sources.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-ginshu-700 underline underline-offset-4">
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </InfoSheet>
  )
}

export function EmptyCellar() {
  const t = useTranslations('prototypeDishPairing')
  return (
    <section className="flex flex-col items-center gap-2.5 px-2.5 py-14 text-center" data-testid="proto-empty-cellar">
      <Stack size={32} className="text-ash-500" aria-hidden="true" />
      <h2 className="text-md-alt font-medium text-ink">{t('emptyTitle')}</h2>
      <p className="max-w-64 text-subtle text-ash-600">{t('emptyBody')}</p>
      <Link
        href="/search"
        className="mt-2 flex min-h-11 items-center rounded-xl border border-ash-300 px-4 text-body font-medium text-ink transition-colors hover:bg-ash-200"
      >
        {t('emptyAction')}
      </Link>
    </section>
  )
}

export function NothingMatches({ dish }: { dish: DishId }) {
  const t = useTranslations('prototypeDishPairing')
  const kind = useKind()
  const kinds = rowsForDish(PAIRING_ROWS, dish).map(kind).join(t('kindsJoin'))
  return (
    <section className="flex flex-col gap-1.5 rounded-xl border border-divider px-4 py-4" data-testid="proto-none-match">
      <h3 className="text-card-heading font-medium text-ink">{t('noneTitle')}</h3>
      <p className="text-subtle text-ash-600">{t('noneBody', { kinds })}</p>
    </section>
  )
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <h2 className="pt-5 pb-2 text-section-label uppercase text-ash-600">{children}</h2>
}
