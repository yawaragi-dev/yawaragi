import { getTranslations } from 'next-intl/server'
import type { FlavorChart } from '@/lib/schemas/flavor-chart'
import { FLAVOR_AXES } from '@/lib/schemas/flavor-chart'
import { FlavorAxisLabel } from './flavor-axis-label'

/**
 * Six-axis Sakenowa flavor chart, rendered as labelled horizontal bars.
 *
 * Each axis is a value in [0, 1]; bars use percent-width fills. A radar /
 * hexagonal visualisation is the Sakenowa-native shape, but bars satisfy
 * the slice-6 AC (six axes rendered, romaji + kanji per axis, tooltip
 * reachable) with markedly less SVG positioning math and are friendlier
 * to AT — `role="progressbar"` is the canonical pattern for a 0..1 value.
 * Phase 7 (design system) is the moment to revisit the visualisation.
 */
interface FlavorChartProps {
  chart: FlavorChart
}

export async function FlavorChartView({ chart }: FlavorChartProps) {
  const t = await getTranslations('sake.brand')
  return (
    <section
      className="flex flex-col gap-3"
      data-testid="brand-flavor-chart"
      aria-label={t('flavorChartLabel')}
    >
      <p className="text-sm uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {t('flavorChartLabel')}
      </p>
      <ul className="flex flex-col gap-3" role="list">
        {FLAVOR_AXES.map((axis) => {
          const value = chart[axis]
          return (
            <li key={axis} className="flex items-center gap-4">
              <div className="w-32 shrink-0">
                <FlavorAxisLabel axis={axis} />
              </div>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={1}
                aria-valuenow={value}
                aria-labelledby={`flavor-axis-${axis}-romaji`}
                className="relative h-2 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
                data-testid={`flavor-axis-${axis}-bar`}
              >
                <span
                  className="absolute left-0 top-0 block h-full rounded-full bg-zinc-700 dark:bg-zinc-200"
                  style={{ width: `${(value * 100).toFixed(1)}%` }}
                />
              </div>
              <span
                className="w-12 shrink-0 text-right text-xs tabular-nums text-zinc-600 dark:text-zinc-400"
                data-testid={`flavor-axis-${axis}-value`}
              >
                {value.toFixed(2)}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
