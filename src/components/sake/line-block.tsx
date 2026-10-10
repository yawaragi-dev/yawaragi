import { getTranslations } from 'next-intl/server'
import { CaretRight } from '@phosphor-icons/react/dist/ssr'
import { Link } from '@/i18n/navigation'
import { FlavorChartView } from '@/components/sake/flavor-chart'
import { InfoSheet } from '@/components/ui/info-sheet'
import type { FlavorChart } from '@/lib/schemas/flavor-chart'

/**
 * §9a's "About the {line} line" (design v1.6, screenshot 52): the one box on
 * a bottling's page that holds what is true of the whole sake rather than of
 * this bottling — its flavor chart and the way to its similar sakes.
 *
 * Sakenowa measures a sake, not each bottling under its name. Shown loose,
 * the chart would read as this bottle's profile; fenced in here, under the
 * caveat and its sheet (§16), the claim stays honest. Nothing line-level sits
 * outside this block.
 *
 * The chart brings its own Sakenowa credit and its brewers'-terms disclosure
 * (§17, ADR-0022). Without a chart the block says so and offers no "Similar":
 * similarity is measured on the chart.
 */
export async function LineBlock({
  brandId,
  lineName,
  lineKanji,
  chart,
}: {
  brandId: number
  /** The line's name as the page shows it (romaji, or kanji without one). */
  lineName: string
  /** The kanji, when the name above is the romaji. */
  lineKanji: string | null
  chart: FlavorChart | null
}) {
  const t = await getTranslations('bottling')
  const tBrand = await getTranslations('sake.brand')
  const tSheet = await getTranslations('provenance.sheet')

  return (
    <section
      className="flex flex-col gap-3 rounded-xl border border-divider p-3.5"
      aria-labelledby={`line-block-${brandId}-title`}
      data-testid="bottling-line-block"
    >
      <div className="flex flex-col gap-1">
        <h2 id={`line-block-${brandId}-title`} className="text-card-heading font-medium text-ink">
          {t.rich('lineBlockTitle', {
            line: lineName,
            kanji: () =>
              lineKanji ? (
                <span className="font-normal text-ash-600" lang="ja">
                  {lineKanji}
                </span>
              ) : null,
          })}
        </h2>
        <InfoSheet
          id={`line-measure-${brandId}`}
          caveat={t('lineCaveat')}
          triggerLabel={t('lineSheet.triggerLabel')}
          title={t('lineSheet.title')}
          closeLabel={tSheet('closeLabel')}
        >
          <p className="mb-3">{t('lineSheet.measured', { line: lineName })}</p>
          <p>{t('lineSheet.howToRead')}</p>
        </InfoSheet>
      </div>
      {chart ? (
        <>
          <FlavorChartView chart={chart} />
          <Link
            href={{ pathname: '/sake/[brandId]/similar', params: { brandId: String(brandId) } }}
            className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-ash-300 px-4 text-body font-medium text-ink transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
            data-testid="line-similar-link"
          >
            {t('similarToLine', { line: lineName })}
            <CaretRight size={16} className="shrink-0 text-ash-600" aria-hidden="true" />
          </Link>
        </>
      ) : (
        <p className="text-body text-ash-600" data-testid="line-block-no-chart">
          {tBrand('flavorChartEmpty')}
        </p>
      )}
    </section>
  )
}
