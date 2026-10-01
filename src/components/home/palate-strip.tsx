import { ArrowRight, Hexagon } from '@phosphor-icons/react/dist/ssr'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import type { FlavorProfile } from '@/lib/schemas/flavor-profile'
import { palateLean } from '@/lib/taste/palate-read'

/**
 * §3's palate strip: "Your palate leans rich, umami-forward · Derived from 3
 * tastings", with a chevron into §12.
 *
 * It restates §12's title on the front door, which is the point — the Palate
 * is a derived view, and a visitor has no reason to open a tab to find out
 * whether anything is in it. The lean is computed the same way §12's title is
 * (`palateLean`), so the two cannot disagree: Home saying "rich,
 * umami-forward" while the Palate says something else would be two answers to
 * one question.
 *
 * The caller renders it only at a read (three tastings or more) — the whole
 * sentence is a claim about a palate, and §12's thresholds decide when there
 * is one to claim.
 */
export async function HomePalateStrip({
  profile,
  ratingCount,
}: {
  profile: FlavorProfile
  ratingCount: number
}) {
  const t = await getTranslations('home')
  const tPalate = await getTranslations('palate')
  const tAxis = await getTranslations('flavorAxis')
  const lean = palateLean(profile)

  return (
    <Link
      href="/profile"
      className="flex min-h-14 items-center gap-3 rounded-xl bg-surface p-3.5 shadow-yw-sm transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
      data-testid="home-palate-strip"
    >
      {/* The hexagon is the six-axis chart in miniature — the same glyph the
          Palate tab uses, so the strip and its destination are recognisably
          the same thing. */}
      <Hexagon size={20} aria-hidden="true" className="shrink-0 text-ginshu-600" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-body text-ink">
          {t('palateLeans')}{' '}
          <span className="text-ginshu-700">
            {tPalate('titleRead', {
              top: tAxis(`${lean.top}.label`),
              lean: tPalate(`lean.${lean.second}`),
            }).toLocaleLowerCase()}
          </span>
        </span>
        {/* `home.derivedFrom`, not `palate.derivedFrom`: §12's line ends
            "· updates as you log", which belongs on the screen that updates,
            not on a one-line strip. */}
        <span className="text-meta text-ash-600">
          {t('derivedFrom', { count: ratingCount })}
        </span>
      </span>
      <ArrowRight size={17} aria-hidden="true" className="shrink-0 text-ash-600" />
    </Link>
  )
}
