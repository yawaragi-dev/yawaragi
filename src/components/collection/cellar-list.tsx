import { getTranslations } from 'next-intl/server'
import { Drop, HourglassMedium, LockSimple, Stack } from '@phosphor-icons/react/dist/ssr'
import { CellarRowActions } from '@/components/collection/cellar-row-actions'
import { cellarFreshness, cellarSummary, sortCellar } from '@/lib/collection/cellar'
import type { CellarBottle } from '@/lib/schemas/cellar-bottle'
import { cn } from '@/lib/utils'

/**
 * §11's Cellar segment. Reference screenshot 20.
 *
 * "{bottles} bottles · {open} open", then one row per sake: thumb, name,
 * "× n", the state line, and two actions. Bottles to finish soon sort first
 * and say so in the accent with an hourglass; then the other open ones; then
 * the sealed ones (`sortCellar`). `now` comes from the page so the render is
 * pure.
 *
 * No brewery line under the name: the row stores the sake's name (ADR-0024),
 * not its brewery, and looking every brewery up on render is the per-row
 * lookup denormalising exists to avoid.
 */
export async function CellarList({
  rows,
  now,
}: {
  rows: readonly CellarBottle[]
  now: number
}) {
  const t = await getTranslations('cellar')

  if (rows.length === 0) {
    return (
      <section
        className="flex flex-col items-center gap-2.5 px-2.5 py-14 text-center"
        data-testid="cellar-empty"
      >
        <Stack size={32} className="text-ash-500" aria-hidden="true" />
        <h2 className="text-md-alt font-medium text-ink">{t('emptyHeading')}</h2>
        <p className="max-w-60 text-subtle text-ash-600">{t('emptyBody')}</p>
      </section>
    )
  }

  const { bottles, open } = cellarSummary(rows)

  return (
    <section className="flex flex-col" data-testid="cellar-list">
      <p className="pb-2 text-meta text-ash-700" data-testid="cellar-summary">
        {t('summary', { bottles, open })}
      </p>
      <ul className="flex flex-col" role="list">
        {sortCellar(rows, now).map((row) => {
          const f = cellarFreshness(row, now)
          const soon = f.kind === 'open' && f.drinkSoon
          const StateIcon = f.kind === 'unopened' ? LockSimple : soon ? HourglassMedium : Drop
          return (
            <li
              key={row.brandId}
              className="flex gap-3 border-b border-divider py-3 last:border-b-0"
              data-testid="cellar-row"
              data-brand-id={row.brandId}
            >
              {/* §11's 36×50 bottle thumb — striped, like every bottle slot,
                  until there are photos (#335). */}
              <span
                aria-hidden="true"
                className="h-[50px] w-9 shrink-0 rounded-[5px] bg-[repeating-linear-gradient(135deg,var(--color-ash-200),var(--color-ash-200)_4px,var(--color-ash-300)_4px,var(--color-ash-300)_8px)]"
              />
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 text-card-heading font-medium text-ink" lang="ja">
                    {row.sake.nameKanji}
                  </span>
                  {row.count > 1 && (
                    <span className="shrink-0 text-meta text-ash-700">
                      {t('countBadge', { count: row.count })}
                    </span>
                  )}
                </span>
                {/* Kanji first, romaji under it — the journal list's order, so
                    one sake reads the same in both segments. */}
                {row.sake.nameRomaji && (
                  <span className="text-meta text-ash-600" lang="en">
                    {row.sake.nameRomaji}
                  </span>
                )}
                <span
                  className={cn(
                    'mt-0.5 flex items-center gap-1.5 text-meta',
                    soon ? 'text-ginshu-700' : 'text-ash-700',
                  )}
                  data-testid="cellar-state"
                >
                  <StateIcon size={14} aria-hidden="true" />
                  {f.kind === 'unopened'
                    ? t('unopened')
                    : soon
                      ? t('drinkSoon', { days: f.days })
                      : t('open', { days: f.days })}
                </span>
                <CellarRowActions brandId={row.brandId} isOpen={f.kind === 'open'} count={row.count} />
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
