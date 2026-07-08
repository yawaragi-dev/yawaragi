'use client'

import { useTranslations } from 'next-intl'
import { HeuristicDisclaimerView } from '@/components/legal/heuristic-disclaimer'
import { ProvenanceBadgeView } from '@/components/sake/provenance-badge'
import { FlavorAxisLabelView } from '@/components/sake/flavor-axis-label'
import { markArrivedViaScan } from '@/lib/scan/arrived-via-scan'
import { SakenowaAttributionView } from '@/components/sake/sakenowa-attribution'
import {
  findNearestExemplars,
  type ReverseExemplarResult,
} from '@/lib/cross-beverage/reverse-lookup'
import {
  FLAVOR_AXES,
  FLAVOR_AXIS_ROMAJI,
  type FlavorChart,
} from '@/lib/schemas/flavor-chart'
import { cn } from '@/lib/utils'

/**
 * ADR-0015 / issue #163 (UX-B), redesigned in UX-F (#167) as the "elevated
 * bone card": the rich, in-place result shown after a confident scan on
 * `/scan`. Shared by design — UX-E's landing hero (#166) renders the same
 * card over a curated sample sake, and passes `exampleLabel` so the sample
 * is unmistakably flagged as an example rather than the visitor's own scan.
 *
 * Client component because:
 * - Its scan-flow caller (`<ScanForm />`) is client and passes the
 *   visitor's own label-photo object URL (a browser Blob) inline.
 * - `next-intl/server`'s `getTranslations` doesn't exist on the client;
 *   `useTranslations` is the equivalent hook.
 *
 * "See full details →" points at `sakeHref` (locale-aware) — the deep-dive
 * permalink and the source of truth for provenance, brewery info, and
 * cross-brand navigation.
 */
export interface ScanResultCardProps {
  /**
   * Client-only object URL created via `URL.createObjectURL(blob)` on the
   * caller side (scan flow), or a static `public/` path (UX-E hero).
   * `null` when the caller has no photo. The parent is responsible for
   * `URL.revokeObjectURL` on unmount / new pick.
   */
  photoUrl: string | null
  /**
   * Alt text for the photo. Localised by the caller — this component is
   * client-side so it could look it up, but keeping alt props under the
   * caller's control avoids a magic key here.
   */
  photoAlt: string
  sakeKanji: string
  sakeRomaji: string | null
  breweryKanji: string
  breweryRomaji: string | null
  /**
   * Locale-aware pathname to `/sake/[brandId]`. Rendered as the
   * "See full details →" affordance.
   */
  sakeHref: string
  /**
   * The six-axis flavor chart for the matched brand. `null` when the
   * brand exists but Sakenowa has no `flavor_charts` row for it — the
   * card still renders (photo + name + link) without the chart rather
   * than falling back to a lesser state.
   */
  flavorChart: FlavorChart | null
  /**
   * Provenance signal for the LLM-extracted sake name. Only rendered
   * when the caller passes a value — the UX-E sample hero uses a
   * curated Sakenowa row and has no `llm_extracted` provenance to
   * surface, so it omits this prop.
   */
  extractionConfidence?: number
  /**
   * When set, renders a small "Example" chip on the card (UX-F #167).
   * The landing hero (#166) passes it so a visitor / recruiter can't
   * mistake the curated sample for their own scan; the real scan flow
   * omits it. The string is the localised chip label ("Example" /
   * "Beispiel").
   */
  exampleLabel?: string
  /**
   * True while a rescan is in flight — the visitor picked a new photo
   * on top of a previously-matched result. The photo (already swapped
   * to the new blob URL) stays at full opacity so the visitor sees
   * their new bottle; everything else fades to `opacity-40` and the
   * card announces `aria-busy`. Preserves the ADR-0015 reward pattern
   * (keep the visitor's photo visible across the transition).
   */
  isStale?: boolean
}

export function ScanResultCard({
  photoUrl,
  photoAlt,
  sakeKanji,
  sakeRomaji,
  breweryKanji,
  breweryRomaji,
  sakeHref,
  flavorChart,
  extractionConfidence,
  exampleLabel,
  isStale = false,
}: ScanResultCardProps) {
  const t = useTranslations('scan.resultCard')
  const tBadge = useTranslations('provenance.badge.llmExtracted')
  const tCrossBevBadge = useTranslations('provenance.badge.crossBeverageMap')
  const tDisclaimer = useTranslations('heuristicDisclaimer')
  const tAttribution = useTranslations('sakenowaAttribution')
  const tSake = useTranslations('sake.brand')

  // UX-C reverse cross-beverage hook (#164): if the matched sake has a
  // Sakenowa flavor chart, name the nearest curated Western exemplar below
  // it. Pure, deterministic — no LLM. Either 1–2 exemplars within threshold
  // OR the graceful "distinctly Japanese profile" fallback; both branches
  // carry <HeuristicDisclaimer /> + <ProvenanceBadge /> per CLAUDE.md.
  const reverseResult: ReverseExemplarResult | null = flavorChart
    ? findNearestExemplars(flavorChart)
    : null

  // #190 stale-fade: the photo stays full-opacity (the visitor's new pick
  // is the acknowledgement the click landed); the whole content column
  // fades to 40%. Opacity doesn't inherit-cancel, so the fade lives on the
  // content wrapper as one knob — the photo column sits outside it. 200 ms
  // reads as intentional and degrades to an unnoticeable snap under
  // `prefers-reduced-motion` without a `motion-safe:` gate.
  const staleClass = isStale ? 'opacity-40 transition-opacity duration-200' : ''

  return (
    <article
      // No `overflow-hidden`: the rounded corners come from `rounded-3xl`
      // (border-radius) and every child (photo, chip) is inset with its own
      // rounding, so nothing needs clipping here — and clipping WOULD cut
      // off the disclaimer / flavor-axis tooltips, which must escape the
      // card. The article stays a plain `relative` box (no stacking
      // context), so a tooltip's `z-10` still floats above whatever sits
      // below the card (the CTA, the surface legend).
      className="relative flex flex-col rounded-3xl bg-stone-50 shadow-[0_24px_70px_-32px_rgba(0,0,0,0.4)] ring-1 ring-black/5 dark:bg-zinc-950 dark:ring-white/10"
      data-testid="scan-result-card"
      aria-busy={isStale || undefined}
    >
      {exampleLabel && (
        <span
          className="absolute left-5 top-5 z-10 rounded-full bg-stone-900/85 px-3 py-1 text-xs font-medium uppercase tracking-wide text-stone-50 shadow-sm backdrop-blur dark:bg-zinc-100/90 dark:text-zinc-900"
          data-testid="scan-result-example-badge"
        >
          {exampleLabel}
        </span>
      )}

      <div
        className={cn(
          'grid gap-0',
          photoUrl && 'sm:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]',
        )}
      >
        {photoUrl && (
          // The photo keeps its true 3:4 aspect (matches the asset, so no
          // crop); on desktop it's vertically centered in the column so a
          // taller content side doesn't leave the photo stranded at the top.
          <div className="p-4 sm:flex sm:items-center sm:p-5">
            <div
              className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-zinc-100 shadow-lg ring-1 ring-black/5 dark:bg-zinc-900"
              data-testid="scan-result-photo-frame"
            >
              {/*
                Native <img> rather than next/image: in the scan flow the
                src is a blob: URL (client-only object URL, ADR-0015) which
                next/image can't accept; the hero passes a static path.
                Kept as one <img> path so both callers share it. The photo
                stays at full opacity across rescans (#190).
              */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoUrl}
                alt={photoAlt}
                className="h-full w-full object-cover"
                data-testid="scan-result-photo"
              />
            </div>
          </div>
        )}

        <div
          className={cn(
            'flex flex-col gap-5 p-6 sm:py-8 sm:pr-8',
            photoUrl && 'sm:pl-2',
            staleClass,
          )}
        >
          <div className="flex items-center justify-end">
            <SakenowaAttributionView
              placement="inline"
              poweredBy={tAttribution('poweredBy')}
              linkLabel={tAttribution('linkLabel')}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span
                className="text-3xl font-semibold tracking-tight text-stone-900 dark:text-zinc-50"
                lang="ja"
                data-testid="scan-result-name-kanji"
              >
                {sakeKanji}
              </span>
              {sakeRomaji && (
                <span
                  className="text-lg text-stone-400 dark:text-zinc-500"
                  data-testid="scan-result-name-romaji"
                >
                  {sakeRomaji}
                </span>
              )}
              {typeof extractionConfidence === 'number' && (
                <ProvenanceBadgeView
                  kind="llmExtracted"
                  label={tBadge('label')}
                  tooltip={tBadge('tooltip')}
                  confidence={extractionConfidence}
                />
              )}
            </div>
            <div
              className="flex flex-wrap items-baseline gap-1.5 text-sm text-stone-500 dark:text-zinc-400"
              data-testid="scan-result-brewery"
            >
              <span className="text-xs uppercase tracking-wide text-stone-400 dark:text-zinc-500">
                {tSake('breweryLabel')}
              </span>
              <span lang="ja">{breweryKanji}</span>
              {breweryRomaji && <span>({breweryRomaji})</span>}
            </div>
          </div>

          {flavorChart && <FlavorGridForCard chart={flavorChart} />}

          {reverseResult && (
            // UX-C reverse hook (#164). 'match' → 1–2 Western exemplars
            // within the honesty threshold; 'no-close-analog' → the
            // discovery-framed "distinctly Japanese profile" line. BOTH
            // carry the disclaimer + crossBeverageMap badge (CLAUDE.md):
            // even "no analog" is a claim from the cross-beverage table.
            // The panel inherits the content column's stale fade, so no
            // per-section opacity knob is needed here.
            <section
              className="flex flex-col gap-2 rounded-2xl bg-amber-50 p-4 dark:bg-amber-950/20"
              data-testid="scan-result-reverse-exemplar"
              aria-labelledby="scan-result-reverse-exemplar-heading"
            >
              <div className="flex flex-wrap items-center gap-2">
                <h3
                  id="scan-result-reverse-exemplar-heading"
                  className="text-sm font-medium text-stone-800 dark:text-zinc-200"
                >
                  {t('reverseExemplarHeading')}
                </h3>
                <ProvenanceBadgeView
                  kind="crossBeverageMap"
                  label={tCrossBevBadge('label')}
                  tooltip={tCrossBevBadge('tooltip')}
                />
              </div>
              {reverseResult.kind === 'match' ? (
                <p
                  className="text-sm text-stone-700 dark:text-zinc-300"
                  data-testid="scan-result-reverse-exemplar-match"
                >
                  {reverseResult.hits.length === 1
                    ? t('reverseExemplarSingle', {
                        name: reverseResult.hits[0]!.exemplar.name,
                      })
                    : t('reverseExemplarPair', {
                        first: reverseResult.hits[0]!.exemplar.name,
                        second: reverseResult.hits[1]!.exemplar.name,
                      })}
                </p>
              ) : (
                <p
                  className="text-sm text-stone-700 dark:text-zinc-300"
                  data-testid="scan-result-reverse-exemplar-no-analog"
                >
                  {t('reverseNoAnalog')}
                </p>
              )}
              <HeuristicDisclaimerView
                title={tDisclaimer('title')}
                body={tDisclaimer('body')}
              />
            </section>
          )}

          {/*
            Native `<a>` rather than next-intl's typed `<Link>` — `sakeHref`
            is a pre-resolved locale-aware path from scan-action, already
            locale-prefixed and segment-substituted; `<Link>` would fight
            the typed-route union. `markArrivedViaScan` sets the per-tab
            marker that lights the "Not this one?" affordance on the target
            (#109).
          */}
          <a
            href={sakeHref}
            onClick={markArrivedViaScan}
            className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-amber-800 underline-offset-2 hover:underline dark:text-amber-300"
            data-testid="scan-result-open-detail"
          >
            {t('openDetail')}
            <span aria-hidden>→</span>
          </a>
        </div>
      </div>
    </article>
  )
}

/**
 * Bone-card flavor grid (UX-F #167): the six axes in a compact 2-column
 * grid with amber bars. Reuses `<FlavorAxisLabelView />` per axis so the
 * romaji + kanji + tooltip "never English-only" compliance (CLAUDE.md) is
 * unchanged, and keeps the `brand-flavor-chart` / `flavor-axis-*` testids
 * and `role="progressbar"` a11y contract of the shared bar view. The sake
 * detail page keeps the sibling `<FlavorChartInlineView />` (row layout);
 * this is a card-local presentation, deliberately not shared, so the
 * detail page is untouched by the scan-card redesign.
 */
function FlavorGridForCard({ chart }: { chart: FlavorChart }) {
  const t = useTranslations('sake.brand')
  const tAxis = useTranslations('flavorAxis')

  return (
    <section
      className="flex flex-col gap-3"
      data-testid="brand-flavor-chart"
      aria-label={t('flavorChartLabel')}
    >
      <p className="text-xs uppercase tracking-wide text-stone-400 dark:text-zinc-500">
        {t('flavorChartLabel')}
      </p>
      <ul className="grid grid-cols-2 gap-x-6 gap-y-3" role="list">
        {FLAVOR_AXES.map((axis) => {
          const value = chart[axis]
          return (
            <li key={axis} className="flex flex-col gap-1.5">
              <div className="flex items-start justify-between gap-2">
                <FlavorAxisLabelView
                  axis={axis}
                  romaji={FLAVOR_AXIS_ROMAJI[axis]}
                  kanji={tAxis(`${axis}.kanji`)}
                  approximation={tAxis(`${axis}.label`)}
                  caveat={tAxis(`${axis}.caveat`)}
                />
                <span
                  className="shrink-0 text-xs tabular-nums text-stone-400 dark:text-zinc-500"
                  data-testid={`flavor-axis-${axis}-value`}
                >
                  {value.toFixed(2)}
                </span>
              </div>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={1}
                aria-valuenow={value}
                aria-labelledby={`flavor-axis-${axis}-romaji`}
                className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-zinc-800"
                data-testid={`flavor-axis-${axis}-bar`}
              >
                <span
                  className="block h-full rounded-full bg-amber-500/90"
                  style={{ width: `${(value * 100).toFixed(1)}%` }}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
