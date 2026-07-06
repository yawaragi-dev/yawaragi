import { getTranslations } from 'next-intl/server'
import type { FlavorChart } from '@/lib/schemas/flavor-chart'
import {
  FLAVOR_AXES,
  FLAVOR_AXIS_ROMAJI,
  type FlavorAxis,
} from '@/lib/schemas/flavor-chart'
import { FlavorAxisLabelView } from './flavor-axis-label'

/**
 * Six-axis Sakenowa flavor chart, rendered as labelled horizontal bars.
 *
 * Each axis is a value in [0, 1]; bars use percent-width fills. A radar /
 * hexagonal visualisation is the Sakenowa-native shape, but bars satisfy
 * the slice-6 AC (six axes rendered, romaji + kanji per axis, tooltip
 * reachable) with markedly less SVG positioning math and are friendlier
 * to AT — `role="progressbar"` is the canonical pattern for a 0..1 value.
 * Phase 7 (design system) is the moment to revisit the visualisation.
 *
 * Split into a sync presentational view + async i18n wrapper (matches the
 * sibling `FlavorAxisLabel` / `SakenowaAttribution` / `ProvenanceBadge`
 * pattern) so the client `<ScanResultCard />` (ADR-0015) can reuse the
 * same rendering by feeding pre-resolved `useTranslations` strings.
 */
interface FlavorChartProps {
  chart: FlavorChart
}

export async function FlavorChartView({ chart }: FlavorChartProps) {
  const t = await getTranslations('sake.brand')
  const tAxis = await getTranslations('flavorAxis')
  return (
    <FlavorChartInlineView
      chart={chart}
      flavorChartLabel={t('flavorChartLabel')}
      axisStrings={buildAxisStrings((axis, field) => tAxis(`${axis}.${field}`))}
    />
  )
}

export interface FlavorAxisStrings {
  kanji: string
  approximation: string
  caveat: string
}

interface FlavorChartInlineViewProps {
  chart: FlavorChart
  flavorChartLabel: string
  axisStrings: Readonly<Record<FlavorAxis, FlavorAxisStrings>>
}

/**
 * Sync view: takes pre-resolved translation strings so both the async
 * server wrapper above and the client `<ScanResultCard />` can render
 * the same bar chart without duplication.
 */
export function FlavorChartInlineView({
  chart,
  flavorChartLabel,
  axisStrings,
}: FlavorChartInlineViewProps) {
  return (
    <section
      className="flex flex-col gap-3"
      data-testid="brand-flavor-chart"
      aria-label={flavorChartLabel}
    >
      <p className="text-sm uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {flavorChartLabel}
      </p>
      <ul className="flex flex-col gap-3" role="list">
        {FLAVOR_AXES.map((axis) => {
          const value = chart[axis]
          const strings = axisStrings[axis]
          return (
            <li key={axis} className="flex items-center gap-4">
              <div className="w-32 shrink-0">
                <FlavorAxisLabelView
                  axis={axis}
                  romaji={FLAVOR_AXIS_ROMAJI[axis]}
                  kanji={strings.kanji}
                  approximation={strings.approximation}
                  caveat={strings.caveat}
                />
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

function buildAxisStrings(
  read: (axis: FlavorAxis, field: 'kanji' | 'label' | 'caveat') => string,
): Readonly<Record<FlavorAxis, FlavorAxisStrings>> {
  const out = {} as Record<FlavorAxis, FlavorAxisStrings>
  for (const axis of FLAVOR_AXES) {
    out[axis] = {
      kanji: read(axis, 'kanji'),
      approximation: read(axis, 'label'),
      caveat: read(axis, 'caveat'),
    }
  }
  return out
}
