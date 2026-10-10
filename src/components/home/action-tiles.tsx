import { Camera, Keyboard } from '@phosphor-icons/react/dist/ssr'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'

/**
 * §3's action tiles — the two things you can do from the front door.
 *
 * The design's v1 layout (Ask off) is two tiles at `1.6fr · 1fr`: **Scan a
 * label** in the accent outline, and **Type it** leading to §8 Search.
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
    <div className="grid grid-cols-[1.6fr_1fr] gap-2.5" data-testid="home-action-tiles">
      <Link
        href="/scan"
        // v1.5 §3: tiles are filled surfaces — icon top-left, label
        // bottom-left — so they never read like the outlined, centred buttons.
        // Only Scan's icon takes the accent.
        className="flex min-h-[78px] flex-col items-start justify-between rounded-lg bg-surface px-[13px] py-3 text-subtle font-medium text-ink shadow-yw-sm transition-colors hover:bg-ash-200 active:bg-ash-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
        data-testid="home-tile-scan"
      >
        <Camera size={22} aria-hidden="true" className="text-ginshu-600" />
        {t('tileScan')}
      </Link>
      <Link
        href="/search"
        className="flex min-h-[78px] flex-col items-start justify-between rounded-lg bg-surface px-[13px] py-3 text-subtle font-medium text-ink shadow-yw-sm transition-colors hover:bg-ash-200 active:bg-ash-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
        data-testid="home-tile-type-it"
      >
        <Keyboard size={22} aria-hidden="true" className="text-ash-700" />
        {t('tileTypeIt')}
      </Link>
    </div>
  )
}
