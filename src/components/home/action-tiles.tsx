import { Camera } from '@phosphor-icons/react/dist/ssr'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'

/**
 * §3's action tiles — the two things you can do from the front door.
 *
 * The design's v1 layout (Ask off) is two tiles at `1.6fr · 1fr`: **Scan a
 * label** in the accent outline, and **Type it** leading to §8 Search.
 *
 * **Only the first ships, full width.** §8 is #323 and currently BLOCKED on
 * #327, so there is no `/search` route for "Type it" to open — and a tile that
 * 404s is worse than a tile that is not there. The grid is written as a single
 * template so restoring the pair is one line plus the tile, not a re-layout.
 *
 * Rendered only once there are tastings. On first run the first-run card's
 * own "Scan a label" is the call to action, and a tile above it would repeat
 * it word for word (see the Home page's deviations).
 *
 * Deliberately not a "Collection" or "Palate" tile in the empty half: those
 * are tabs, one tap away on the bottom edge already, and §3's tiles are for
 * the two ways to *start* — which is a different job from navigating.
 */
export async function HomeActionTiles() {
  const t = await getTranslations('home')

  return (
    <div className="grid grid-cols-1 gap-2.5" data-testid="home-action-tiles">
      <Link
        href="/scan"
        className="flex min-h-[86px] flex-col items-center justify-center gap-2 rounded-xl border border-ginshu-400 py-4 text-card-heading font-medium text-ginshu-700 transition-colors hover:bg-ginshu-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
        data-testid="home-tile-scan"
      >
        <Camera size={23} aria-hidden="true" />
        {t('tileScan')}
      </Link>
    </div>
  )
}
