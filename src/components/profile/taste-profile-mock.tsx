import { getTranslations } from 'next-intl/server'
import { FlavorRadarView } from '@/components/sake/flavor-radar-view'
import type { FlavorProfile } from '@/lib/schemas/flavor-profile'

/**
 * Static radar mock of a taste profile over the six Sakenowa flavor axes.
 * A thin caller (#198): the SVG geometry and axis labels now live in the
 * reusable `<FlavorRadarView />`; this component only supplies illustrative
 * sample values and the figure chrome (heading + caption). When Phase 5's
 * Taste Profile builder lands, it passes a real derived `TasteProfile`
 * through the same `FlavorRadarView` seam.
 *
 * Data is **illustrative sample values**, not sourced from any real brand
 * profile — chosen to look like a hanayaka-forward, keikai-finishing
 * profile so a visitor gets a coherent read on what a real profile would
 * look like. Because nothing here is Sakenowa data, `<SakenowaAttribution />`
 * is deliberately NOT rendered (would misrepresent the source per ADR-0005).
 */

// Sample profile — six values in [0,1]. f1 hanayaka high, f6 keikai high,
// low f3 juko → a fragrant/crisp read.
const SAMPLE_PROFILE: FlavorProfile = {
  f1: 0.72,
  f2: 0.35,
  f3: 0.25,
  f4: 0.45,
  f5: 0.55,
  f6: 0.68,
}

export async function TasteProfileMock() {
  const t = await getTranslations('profile')

  return (
    <figure
      className="flex flex-col items-center gap-4"
      data-testid="taste-profile-mock"
      aria-label={t('sampleHeading')}
    >
      <FlavorRadarView profile={SAMPLE_PROFILE} />
      <figcaption className="max-w-md text-center text-sm text-zinc-600 dark:text-zinc-400">
        {t('sampleCaption')}
      </figcaption>
    </figure>
  )
}
