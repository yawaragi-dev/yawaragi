import { FLAVOR_AXES, type FlavorAxis } from '@/lib/schemas/flavor-chart'
import type { FlavorProfile } from '@/lib/schemas/flavor-profile'
import { FlavorAxisLabelView } from './flavor-axis-label'
import { FlavorTermsSheet, type FlavorTermsStrings } from './flavor-terms-sheet'

/**
 * The one FlavorProfile renderer.
 *
 * Before this, the same six-axis presentation was hand-authored FOUR times
 * — the sake-detail row chart (`FlavorChartInlineView`), the scan card's
 * grid (`FlavorGridForCard`), the suggest cluster (`FlavorAxisCluster`),
 * and the taste-profile radar. The three bar/label variants re-derived
 * identical `role="progressbar"` markup, value formatting, and axis-string
 * resolution; a comment in `flavor-chart.tsx` even *claimed* the scan card
 * reused its view when it did not. This module is the actual shared seam.
 *
 * It is a sync presentational component (no i18n calls of its own) so both
 * async server wrappers (`getTranslations`) and the client `ScanResultCard`
 * (`useTranslations`, ADR-0015) render it by feeding pre-resolved strings —
 * the same sync-View + async-wrapper discipline the sibling primitives use.
 *
 * The SVG radar is deliberately NOT a variant here — its geometry shares
 * nothing with bars but the axis list, so folding it in would make this a
 * shallow dispatcher. It lives in `flavor-radar-view.tsx`.
 *
 * A `TasteProfile` (a User's aggregated preference, CONTEXT.md) is the same
 * six axes as a Sake's `FlavorProfile`, so Phase 5 renders through here too.
 */

export interface FlavorAxisStrings {
  kanji: string
  approximation: string
  caveat: string
}

// Pure resolver: turns a per-axis string reader (server `getTranslations`
// or client `useTranslations`, both keyed `flavorAxis.<axis>.<field>`) into
// the resolved strings the sync view needs. Exported so no surface re-derives
// the `${axis}.${field}` key layout — the one place it drifted (a copy mapped
// i18n key `label` to the wrong prop) becomes impossible.
export function buildFlavorAxisStrings(
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

export type FlavorProfileVariant = 'row' | 'grid' | 'cluster'

interface FlavorProfileViewProps {
  /** The six axis values. Accepts a bare FlavorProfile or anything wider
   *  (FlavorChart, a Suggestion's flavor_profile) — only f1..f6 are read. */
  profile: FlavorProfile
  /** Pre-resolved axis strings (see `buildFlavorAxisStrings`). */
  axisStrings: Readonly<Record<FlavorAxis, FlavorAxisStrings>>
  /** Localised "Flavor chart (Sakenowa)" section label — the accessible
   *  name for the region (and the visible header on the bar variants). */
  chartLabel: string
  /** Layout:
   *  - `row`    — full-width labelled bars, one per line (sake detail page)
   *  - `grid`   — 2-col compact bars (scan result card)
   *  - `cluster`— label + value chips, no bars (suggest card) */
  variant: FlavorProfileVariant
  /** Strings for the ADR-0022 disclosure. Required, not optional: the axes
   *  render as English approximations ONLY because this sheet is reachable,
   *  so a caller must not be able to omit it. */
  termsStrings: FlavorTermsStrings
  /** Disambiguates the disclosure's element ids when a page renders several
   *  charts — `/suggest` shows up to five. */
  instanceId: string
}

// Per-variant presentation. Testids are preserved verbatim from the four
// original renderers so the e2e contracts (sake-page, landing, scan,
// suggest) keep passing: both bar variants share `brand-flavor-chart`; the
// cluster keeps `suggest-card-flavor-cluster`.
// Still the pre-Ginshu palette, deliberately.
//
// Design v1.4 §17 wants a 4px bar, ginshu-500 on ash-200, under an 11px
// uppercase section label — and an earlier revision of this PR shipped that.
// It was wrong: these pages are still light-themed, and Ginshu's text steps
// are built for a #1b1a19 ground. `ash-700` on white measures **1.96:1** and
// `ash-600` **2.48:1**, against a 4.5:1 floor. The chart was legible in the
// design and near-invisible in the app.
//
// So the rule this file follows: **a component adopts Ginshu when the page
// under it does, not before.** The tokens in globals.css are additive for
// exactly that reason; re-theming a component ahead of its surface throws
// the benefit away. The §17 treatment lands with the surface port.
//
// (The terms sheet below is the exception, and a principled one: it paints
// its own dark ground, so it is not borrowing this page's.)
const VARIANT = {
  row: {
    containerTestId: 'brand-flavor-chart',
    headerClass:
      'text-sm uppercase tracking-wide text-zinc-500 dark:text-zinc-400',
    trackClass: 'bg-zinc-200 dark:bg-zinc-800',
    fillClass: 'bg-zinc-700 dark:bg-zinc-200',
  },
  grid: {
    containerTestId: 'brand-flavor-chart',
    headerClass:
      'text-xs uppercase tracking-wide text-stone-400 dark:text-zinc-500',
    trackClass: 'bg-stone-200 dark:bg-zinc-800',
    fillClass: 'bg-amber-500/90',
  },
} as const

export function FlavorProfileView({
  profile,
  axisStrings,
  chartLabel,
  variant,
  termsStrings,
  instanceId,
}: FlavorProfileViewProps) {
  const disclosure = (
    <FlavorTermsSheet
      strings={termsStrings}
      axisStrings={axisStrings}
      instanceId={instanceId}
    />
  )

  if (variant === 'cluster') {
    // The cluster has no visible heading (its name is the aria-label), so
    // the disclosure trails the chips rather than sitting beside a header.
    // It still has to be here — ADR-0022 binds the sheet to the axis words,
    // not to any one layout.
    return (
      <section
        className="flex flex-wrap items-center gap-3 pt-1"
        data-testid="suggest-card-flavor-cluster"
        aria-label={chartLabel}
      >
        {FLAVOR_AXES.map((axis) => (
          <div key={axis} className="flex items-center gap-2">
            <AxisLabel axis={axis} strings={axisStrings[axis]} />
            <ValueText axis={axis} value={profile[axis]} />
          </div>
        ))}
        {disclosure}
      </section>
    )
  }

  const style = VARIANT[variant]
  const isGrid = variant === 'grid'

  return (
    <section
      className="flex flex-col gap-3"
      data-testid={style.containerTestId}
      aria-label={chartLabel}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className={style.headerClass}>{chartLabel}</p>
        {disclosure}
      </div>
      <ul
        className={isGrid ? 'grid grid-cols-2 gap-x-6 gap-y-3' : 'flex flex-col gap-3'}
        role="list"
      >
        {FLAVOR_AXES.map((axis) => {
          const value = profile[axis]
          return (
            <li
              key={axis}
              className={
                isGrid ? 'flex flex-col gap-1.5' : 'flex items-center gap-4'
              }
            >
              {isGrid ? (
                <div className="flex items-start justify-between gap-2">
                  <AxisLabel axis={axis} strings={axisStrings[axis]} />
                  <ValueText axis={axis} value={value} />
                </div>
              ) : (
                <div className="w-32 shrink-0">
                  <AxisLabel axis={axis} strings={axisStrings[axis]} />
                </div>
              )}
              <Bar axis={axis} value={value} style={style} isGrid={isGrid} />
              {!isGrid && <ValueText axis={axis} value={value} rowTrailing />}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function AxisLabel({
  axis,
  strings,
}: {
  axis: FlavorAxis
  strings: FlavorAxisStrings
}) {
  return <FlavorAxisLabelView axis={axis} approximation={strings.approximation} />
}

function ValueText({
  axis,
  value,
  rowTrailing = false,
}: {
  axis: FlavorAxis
  value: number
  rowTrailing?: boolean
}) {
  return (
    <span
      className={
        rowTrailing
          ? 'w-12 shrink-0 text-right text-xs tabular-nums text-zinc-600 dark:text-zinc-400'
          : 'shrink-0 text-xs tabular-nums text-stone-400 dark:text-zinc-500'
      }
      data-testid={`flavor-axis-${axis}-value`}
    >
      {value.toFixed(2)}
    </span>
  )
}

function Bar({
  axis,
  value,
  style,
  isGrid,
}: {
  axis: FlavorAxis
  value: number
  style: { trackClass: string; fillClass: string }
  isGrid: boolean
}) {
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={1}
      aria-valuenow={value}
      aria-labelledby={`flavor-axis-${axis}-label`}
      className={
        isGrid
          ? `h-1.5 w-full overflow-hidden rounded-full ${style.trackClass}`
          : `relative h-2 flex-1 overflow-hidden rounded-full ${style.trackClass}`
      }
      data-testid={`flavor-axis-${axis}-bar`}
    >
      <span
        className={
          isGrid
            ? `block h-full rounded-full ${style.fillClass}`
            : `absolute left-0 top-0 block h-full rounded-full ${style.fillClass}`
        }
        style={{ width: `${(value * 100).toFixed(1)}%` }}
      />
    </div>
  )
}
