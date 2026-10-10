import { Camera, Hexagon, Wine } from '@phosphor-icons/react/dist/ssr'
import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'

/**
 * §3's first-run card — what the app is for, before you have used it.
 *
 * The design's copy is "Point the camera at the label, tap a star, and it's in
 * your journal. No account needed", over three steps: *Scan the label or
 * menu* · *One star and it's saved* · *Your palate forms at three*.
 *
 * **Two of those three are promises we do not keep yet**, and this card is the
 * first thing a new visitor reads, so the copy is adapted rather than ported
 * verbatim:
 *
 * - §5's star IS the save (rule 1) and the star row is Phase 2 — so "tap a
 *   star and it's saved" would be a tour of a control that is not there.
 * - The journal is maintainer-only until the local-first rewrite (ADR-0020,
 *   gated on ADR-0011), so "it's in your journal. No account needed" is
 *   exactly backwards for everyone reading it today.
 * - Menu scan is deferred (#298), so "label or menu" names a mode that cannot
 *   be selected.
 *
 * What the three steps say instead is what the app actually does right now:
 * scan a label, see what the catalogue knows, and start a Palate from a drink
 * you already like — which is the cold-start card §3 puts directly below this
 * one, so the third step points at something on the same screen. The design's
 * copy comes back with the features, and the strings are keyed so that is a
 * `messages/` change rather than a re-layout.
 */
export async function HomeFirstRunCard() {
  const t = await getTranslations('home.firstRun')

  const steps = [
    { key: 'scan', icon: Camera },
    { key: 'learn', icon: Wine },
    { key: 'palate', icon: Hexagon },
  ] as const

  return (
    <section
      className="flex flex-col gap-3 rounded-xl bg-surface p-4 shadow-yw-sm"
      data-testid="home-first-run"
    >
      {/* The accent "mark": 2px × 14px, beside the heading and never above it. */}
      <h2 className="flex items-start gap-2 text-title font-medium text-ink">
        <span aria-hidden="true" className="mt-2 block h-3.5 w-0.5 shrink-0 bg-ginshu-500" />
        {t('heading')}
      </h2>
      <p className="text-body text-ash-600">{t('body')}</p>

      <ul className="grid grid-cols-3 gap-2" role="list">
        {steps.map(({ key, icon: Icon }) => (
          <li
            key={key}
            className="flex flex-col gap-2 rounded-xl bg-ash-200 p-3"
            data-testid={`home-first-run-step-${key}`}
          >
            <Icon size={19} aria-hidden="true" className="text-ginshu-600" />
            <span className="text-meta leading-snug text-ink">{t(`step.${key}`)}</span>
          </li>
        ))}
      </ul>

      <Link
        href="/scan"
        className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-ginshu-400 px-4 text-card-heading font-medium text-ginshu-700 transition-colors hover:bg-ginshu-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
        data-testid="home-first-run-cta"
      >
        <Camera size={17} aria-hidden="true" />
        {t('cta')}
      </Link>
      {/* v1.5 §3: the card's one action pair — the primary, then a ghost
          "Or type the name", which ships now that §8 has. */}
      <Link
        href="/search"
        className="-mt-1 flex min-h-11 items-center justify-center text-subtle font-medium text-ginshu-700 hover:text-ginshu-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
        data-testid="home-first-run-type-it"
      >
        {t('typeIt')}
      </Link>
    </section>
  )
}
