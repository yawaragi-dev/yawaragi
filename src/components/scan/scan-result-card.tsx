'use client'

import { useTranslations } from 'next-intl'
import {
  FlavorChartInlineView,
  type FlavorAxisStrings,
} from '@/components/sake/flavor-chart'
import { HeuristicDisclaimerView } from '@/components/legal/heuristic-disclaimer'
import { ProvenanceBadgeView } from '@/components/sake/provenance-badge'
import { SakenowaAttributionView } from '@/components/sake/sakenowa-attribution'
import {
  findNearestExemplars,
  type ReverseExemplarResult,
} from '@/lib/cross-beverage/reverse-lookup'
import {
  FLAVOR_AXES,
  type FlavorAxis,
  type FlavorChart,
} from '@/lib/schemas/flavor-chart'
import { cn } from '@/lib/utils'

/**
 * ADR-0015 / issue #163 (UX-B). The rich, in-place result card shown after
 * a confident scan on `/scan` — replaces the S3 auto-navigate to
 * `/sake/[brandId]`. Reusable by design so UX-E's landing hero can render
 * the same shape over a curated sample sake without needing its own layout
 * (issue #163 AC: "The result card is a reusable component consumable by
 * UX-E").
 *
 * Client component because:
 * - Its sole caller today (`<ScanForm />`) is client and needs to pass the
 *   visitor's own label-photo object URL (produced from a browser Blob)
 *   inline. Threading that through a server boundary would force a base64
 *   round-trip.
 * - `next-intl/server`'s `getTranslations` doesn't exist on the client;
 *   `useTranslations` is the equivalent hook.
 *
 * "See full details →" points at `sakeHref` (locale-aware). That target is
 * the deep-dive permalink and stays the source of truth for provenance,
 * brewery info, and cross-brand navigation.
 */
export interface ScanResultCardProps {
  /**
   * Client-only object URL created via `URL.createObjectURL(blob)` on the
   * caller side. Never uploaded, never persisted. `null` when the caller
   * has no photo (e.g. the UX-E sample-hero use case). The parent is
   * responsible for `URL.revokeObjectURL` on unmount / new pick.
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
   * True while a rescan is in flight — the visitor picked a new photo
   * on top of a previously-matched result. The photo (already swapped
   * to the new blob URL) stays at full opacity so the visitor sees
   * their new bottle. Everything else — attribution, name, brewery,
   * link, flavor chart — fades to `opacity-40` and the card region
   * announces `aria-busy` so screen readers say "the previous match
   * is being replaced". A cheaper alternative to a skeleton that
   * preserves the ADR-0015 reward pattern (keep the visitor's photo
   * visible across the transition).
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
  isStale = false,
}: ScanResultCardProps) {
  const t = useTranslations('scan.resultCard')
  const tBadge = useTranslations('provenance.badge.llmExtracted')
  const tCrossBevBadge = useTranslations('provenance.badge.crossBeverageMap')
  const tDisclaimer = useTranslations('heuristicDisclaimer')
  const tAttribution = useTranslations('sakenowaAttribution')
  const tSake = useTranslations('sake.brand')

  // UX-C reverse cross-beverage hook (issue #164): if the matched sake has
  // a Sakenowa flavor chart, look up the nearest curated Western exemplar
  // and name it below the chart. Pure, deterministic — no LLM. Rendered
  // only when the chart exists (Sakenowa's `flavor_charts` misses on a
  // fraction of brands; without a vector there's nothing to match against).
  // The result is either 1–2 exemplars within threshold OR the graceful
  // "distinctly Japanese profile" fallback. Both branches carry the
  // <HeuristicDisclaimer /> + <ProvenanceBadge /> per CLAUDE.md.
  const reverseResult: ReverseExemplarResult | null = flavorChart
    ? findNearestExemplars(flavorChart)
    : null

  // Opacity is not inherit-cancellable from a child, so we can't fade
  // the whole article and then rescue the photo — every region that
  // should fade has to carry the class explicitly. Kept as a single
  // constant so the fade duration + level stay in lockstep across the
  // regions (a maintainer nudging one will notice they're touching a
  // shared knob). Duration is 200 ms — long enough to read as
  // intentional, short enough that `prefers-reduced-motion` renders it
  // as an unnoticeable snap without a `motion-safe:` gate.
  const staleClass = isStale ? 'opacity-40 transition-opacity duration-200' : ''

  return (
    <article
      className="flex flex-col gap-6 rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950"
      data-testid="scan-result-card"
      aria-busy={isStale || undefined}
    >
      <SakenowaAttributionView
        placement="inline"
        poweredBy={tAttribution('poweredBy')}
        linkLabel={tAttribution('linkLabel')}
        className={staleClass}
      />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {photoUrl && (
          <div
            className="relative aspect-[3/4] w-32 shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900"
            data-testid="scan-result-photo-frame"
          >
            {/*
              Native <img> rather than next/image on purpose: the src is
              a blob: URL from the browser (client-only object URL,
              ADR-0015). next/image expects same-origin or configured
              remotes and would throw at build time on a blob: source.

              Photo stays at full opacity across rescans — the visitor's
              new pick is the acknowledgement that the click landed.
            */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl}
              alt={photoAlt}
              className="h-full w-full object-cover"
              data-testid="scan-result-photo"
            />
          </div>
        )}
        <div className={cn('flex flex-col gap-2', staleClass)}>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="text-2xl font-semibold"
              lang="ja"
              data-testid="scan-result-name-kanji"
            >
              {sakeKanji}
            </span>
            {sakeRomaji && (
              <span
                className="text-base text-zinc-600 dark:text-zinc-400"
                data-testid="scan-result-name-romaji"
              >
                ({sakeRomaji})
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
            className="flex flex-wrap items-baseline gap-1.5 text-sm text-zinc-600 dark:text-zinc-400"
            data-testid="scan-result-brewery"
          >
            <span className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-500">
              {tSake('breweryLabel')}
            </span>
            <span lang="ja">{breweryKanji}</span>
            {breweryRomaji && <span>({breweryRomaji})</span>}
          </div>
          {/*
            Native `<a>` rather than `next-intl`'s typed `<Link>` — the
            `sakeHref` is a pre-resolved locale-aware path emitted by
            `scan-action` (`getPathname({ href: { pathname: '/sake/[brandId]',
            params }})`), so the string is already correctly locale-
            prefixed and dynamic-segment-substituted. Threading it
            through `<Link>` would fight the typed-route union.
          */}
          <a
            href={sakeHref}
            className="mt-1 inline-flex w-fit items-center gap-1 text-sm font-medium text-blue-700 underline-offset-2 hover:underline dark:text-blue-300"
            data-testid="scan-result-open-detail"
          >
            {t('openDetail')}
            <span aria-hidden>→</span>
          </a>
        </div>
      </div>

      {flavorChart && (
        <div className={staleClass}>
          <FlavorChartForCard chart={flavorChart} />
        </div>
      )}

      {reverseResult && (
        // UX-C reverse cross-beverage hook (#164). Two branches:
        //   - 'match' — surface 1–2 Western exemplars whose 6-axis
        //     vector sits within the honesty threshold of this sake's
        //     flavor chart. "Interesting for those who like Lagavulin
        //     16."
        //   - 'no-close-analog' — the profile is far from every anchor
        //     in `CROSS_BEVERAGE_MAP`. Renders the discovery-framed
        //     "distinctly Japanese profile" line instead of forcing a
        //     bad match.
        //
        // BOTH branches render `<HeuristicDisclaimerView />` and a
        // `<ProvenanceBadgeView kind="crossBeverageMap" />` per CLAUDE.md
        // — even the "no analog" line is a claim from the cross-beverage
        // table (specifically: "the table has no close match"), and
        // omitting the disclaimer would blur the provenance boundary.
        // Exemplar names stay identical across locales — Lagavulin 16
        // is a proper noun, not translatable copy.
        //
        // The `staleClass` bundles the fade + `transition-opacity` from
        // #190 so this section joins the rest of the details region in
        // going to 40% while a rescan is in flight. The photo stays
        // full-opacity above.
        <section
          className={cn('flex flex-col gap-3', staleClass)}
          data-testid="scan-result-reverse-exemplar"
          aria-labelledby="scan-result-reverse-exemplar-heading"
        >
          <div className="flex flex-wrap items-center gap-2">
            <h3
              id="scan-result-reverse-exemplar-heading"
              className="text-sm font-medium text-zinc-800 dark:text-zinc-200"
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
              className="text-sm text-zinc-700 dark:text-zinc-300"
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
              className="text-sm text-zinc-700 dark:text-zinc-300"
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
    </article>
  )
}

/**
 * Thin client wrapper: reads the same i18n namespaces the async
 * `<FlavorChartView />` reads via `getTranslations`, hands the resolved
 * strings to the shared `<FlavorChartInlineView />`. Same bar rendering
 * as the sake detail page — the sync view is the single source of truth
 * (see ADR-0015 refactor).
 */
function FlavorChartForCard({ chart }: { chart: FlavorChart }) {
  const t = useTranslations('sake.brand')
  const tAxis = useTranslations('flavorAxis')

  const axisStrings = {} as Record<FlavorAxis, FlavorAxisStrings>
  for (const axis of FLAVOR_AXES) {
    axisStrings[axis] = {
      kanji: tAxis(`${axis}.kanji`),
      approximation: tAxis(`${axis}.label`),
      caveat: tAxis(`${axis}.caveat`),
    }
  }

  return (
    <FlavorChartInlineView
      chart={chart}
      flavorChartLabel={t('flavorChartLabel')}
      axisStrings={axisStrings}
    />
  )
}
