import { FLAVOR_AXES, type FlavorAxis } from '@/lib/schemas/flavor-chart'
import type { FlavorProfile } from '@/lib/schemas/flavor-profile'
import { type AxisComparison, compareAxis } from '@/lib/taste/palate-read'

/**
 * §12's "What shapes it" rows — one per axis, in the canonical order.
 *
 * Each row carries the visitor's value as a bar, a tick for the reference, and
 * a word for the difference. The word is the row's point: a bar and a tick
 * close together is a *picture* of "about the same", and a picture is not
 * reachable by a screen reader or by anyone reading at a glance.
 *
 * §12's reference is "the typical drinker" and ours is the catalogue's mean
 * sake, because the drinker average needs an aggregation we have no lawful
 * basis for yet (#297). The word keeps the design's phrasing ("More than
 * most") and a note under the list says what "most" is — rather than each row
 * repeating "than most sakes", which wrapped to two lines on all six and made
 * the list twice as tall for the same information. Where there is no reference
 * at all (no mirror), the tick, the word and the note are all omitted rather
 * than defaulted: a tick at zero would make every axis read "more".
 *
 * §12 also makes each row tappable ("tap to see why") into the axis-detail
 * screen (24). That screen is not built, so these are not controls — a row
 * that looks tappable and does nothing is the no-feedback defect #184 was
 * filed for.
 */

export interface PalateAxisStrings {
  /** The section heading. §12: "What shapes it · tap to see why". */
  heading: string
  /** Per-axis display word — Floral, Mellow, … (ADR-0022). */
  axisLabel: (axis: FlavorAxis) => string
  /** The difference word for a comparison. */
  comparison: (comparison: AxisComparison) => string
  /** Accessible description of one row, given its label and value percent. */
  rowLabel: (axis: FlavorAxis, percent: number) => string
}

export function PalateAxisRows({
  profile,
  reference,
  strings,
}: {
  profile: FlavorProfile
  /** The catalogue mean, or null when the mirror is unavailable. */
  reference: FlavorProfile | null
  strings: PalateAxisStrings
}) {
  return (
    <section className="flex flex-col gap-3" data-testid="palate-axis-rows">
      <h2 className="text-section-label uppercase text-ash-600">{strings.heading}</h2>
      <ul className="flex flex-col gap-2" role="list">
        {FLAVOR_AXES.map((axis) => {
          const value = profile[axis]
          const percent = Math.round(Math.max(0, Math.min(1, value)) * 100)
          const referenceValue = reference?.[axis]
          return (
            <li
              key={axis}
              // 48px minimum, "may grow" — German words are longer and the
              // comparison column has to be allowed to wrap rather than
              // squeeze the bar.
              className="grid min-h-12 grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3"
              data-testid={`palate-axis-${axis}`}
            >
              <span className="text-body text-ink">{strings.axisLabel(axis)}</span>
              <span
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                aria-label={strings.rowLabel(axis, percent)}
                className="relative block h-1 w-full rounded-full bg-ash-200"
              >
                <span
                  className="block h-full rounded-full bg-ginshu-500"
                  style={{ width: `${percent}%` }}
                />
                {referenceValue !== undefined && (
                  // The reference tick. 2px, neutral-700, drawn ON the track
                  // so the comparison is spatial as well as verbal.
                  <span
                    aria-hidden="true"
                    data-testid={`palate-axis-${axis}-tick`}
                    className="absolute -top-1 h-3 w-0.5 -translate-x-1/2 rounded-full bg-ash-700"
                    style={{
                      left: `${Math.round(Math.max(0, Math.min(1, referenceValue)) * 100)}%`,
                    }}
                  />
                )}
              </span>
              {referenceValue !== undefined ? (
                <span
                  className="max-w-28 text-right text-meta text-ash-600"
                  data-testid={`palate-axis-${axis}-word`}
                >
                  {strings.comparison(compareAxis(value, referenceValue))}
                </span>
              ) : (
                <span />
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
