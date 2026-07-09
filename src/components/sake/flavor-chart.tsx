import { getTranslations } from 'next-intl/server'
import type { FlavorChart } from '@/lib/schemas/flavor-chart'
import {
  FlavorProfileView,
  buildFlavorAxisStrings,
} from './flavor-profile-view'

/**
 * Sake-detail flavor chart — labelled horizontal bars, one axis per line.
 *
 * This is now a thin async i18n wrapper: it resolves the section label and
 * the per-axis strings on the server, then delegates all rendering to the
 * shared `<FlavorProfileView variant="row" />`. The bar markup, value
 * formatting, and `role="progressbar"` a11y contract live once there (used
 * by the scan card and suggest cluster too) rather than being re-authored
 * per surface as they were before #198.
 *
 * A radar / hexagonal visualisation is the Sakenowa-native shape; bars
 * satisfy the six-axis AC with less positioning math and are friendlier to
 * AT. Phase 7 (design system) is the moment to revisit the visualisation.
 */
interface FlavorChartProps {
  chart: FlavorChart
}

export async function FlavorChartView({ chart }: FlavorChartProps) {
  const t = await getTranslations('sake.brand')
  const tAxis = await getTranslations('flavorAxis')
  return (
    <FlavorProfileView
      profile={chart}
      variant="row"
      chartLabel={t('flavorChartLabel')}
      axisStrings={buildFlavorAxisStrings((axis, field) => tAxis(`${axis}.${field}`))}
    />
  )
}
