import { FLAVOR_AXES, FLAVOR_AXIS_ROMAJI } from '@/lib/schemas/flavor-chart'
import { InfoSheet } from '@/components/ui/info-sheet'
import type { FlavorAxisStrings } from './flavor-profile-view'

/**
 * The disclosure that makes ADR-0022 defensible: the six flavour axes render
 * as English words, and this sheet is where the app says what those words
 * actually are — approximations of Japanese brewers' terms, not translations.
 *
 * Design v1.4 §13, built on the shared §16 pattern (`<InfoSheet />`), so the
 * caveat line stays in the DOM and reaches a screen reader via
 * `aria-describedby` whether or not the sheet is ever opened.
 *
 * It takes pre-resolved strings rather than calling `getTranslations` itself,
 * because the charts that render it are sync views used from both server
 * wrappers and the client scan card (ADR-0015). The per-axis rows are built
 * from data the chart already holds — `axisStrings` plus the locale-invariant
 * `FLAVOR_AXIS_ROMAJI` — so adopting this cost no new per-axis i18n keys.
 */

export interface FlavorTermsStrings {
  /** Short visible line beside the chart heading. */
  caveat: string
  /** Accessible name for the info button. */
  triggerLabel: string
  /** Sheet heading. */
  title: string
  /** The paragraph that does the actual disclosing. */
  intro: string
  closeLabel: string
}

/** i18n keys under `flavorAxis.disclosure.*`. */
export const FLAVOR_TERMS_KEYS = [
  'caveat',
  'triggerLabel',
  'title',
  'intro',
  'closeLabel',
] as const

/**
 * Resolves the five disclosure strings from a per-key reader, mirroring
 * `buildFlavorAxisStrings`. Exported so no call site re-derives the
 * `flavorAxis.disclosure.<key>` layout — four surfaces render a chart and
 * each one drifting its own keys is exactly how the axis strings went wrong
 * before #198.
 */
export function buildFlavorTermsStrings(
  read: (key: (typeof FLAVOR_TERMS_KEYS)[number]) => string,
): FlavorTermsStrings {
  return {
    caveat: read('caveat'),
    triggerLabel: read('triggerLabel'),
    title: read('title'),
    intro: read('intro'),
    closeLabel: read('closeLabel'),
  }
}

interface FlavorTermsSheetProps {
  strings: FlavorTermsStrings
  axisStrings: Readonly<Record<string, FlavorAxisStrings>>
  /** Disambiguates this instance when a page renders several charts —
   *  `/suggest` shows up to five. */
  instanceId: string
  className?: string
}

export function FlavorTermsSheet({
  strings,
  axisStrings,
  instanceId,
  className,
}: FlavorTermsSheetProps) {
  return (
    <InfoSheet
      id={`flavour-terms-${instanceId}`}
      caveat={strings.caveat}
      triggerLabel={strings.triggerLabel}
      title={strings.title}
      closeLabel={strings.closeLabel}
      className={className}
    >
      <p className="mb-4">{strings.intro}</p>
      <dl className="flex flex-col gap-3" data-testid="flavour-terms-list">
        {FLAVOR_AXES.map((axis) => {
          const s = axisStrings[axis]
          return (
            <div key={axis} className="flex gap-3" data-testid={`flavour-term-${axis}`}>
              <dt className="w-[62px] shrink-0 text-secondary font-medium text-ink">
                {s.approximation}
              </dt>
              <dd className="min-w-0 flex-1">
                <span className="text-secondary text-ink" lang="ja">
                  {s.kanji}
                </span>{' '}
                <span className="text-meta text-ash-600">
                  {FLAVOR_AXIS_ROMAJI[axis]}
                </span>
                <span className="mt-0.5 block text-meta leading-snug text-ash-700">
                  {s.caveat}
                </span>
              </dd>
            </div>
          )
        })}
      </dl>
    </InfoSheet>
  )
}
