import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { HeuristicDisclaimer } from '@/components/legal/heuristic-disclaimer'
import { ProvenanceBadge } from '@/components/sake/provenance-badge'
import {
  FlavorProfileView,
  buildFlavorAxisStrings,
} from '@/components/sake/flavor-profile-view'
import {
  SakenowaAttribution,
  requiresSakenowaAttribution,
} from '@/components/sake/sakenowa-attribution'
import type { Suggestion } from '@/lib/schemas/suggestion'

/**
 * Phase 4 / S5–S6 (#143, #144) — RSC card list for the suggest results page.
 *
 * Every card renders per-field provenance:
 *
 *   - `name_ja` / `name_romaji` — Sakenowa-canonical, no badge, but the
 *     card carries an inline `<SakenowaAttribution placement="inline" />`
 *     alongside so the attribution obligation (CLAUDE.md § "Sakenowa
 *     attribution") is satisfied per-card, not just at the page level.
 *   - `reason` — LLM-inferred prose, gets `<ProvenanceBadge
 *     source="llm_inferred" />`. Load-bearing per CLAUDE.md's
 *     "Do NOT show LLM-extracted data without a ProvenanceBadge" rule.
 *   - `cross_beverage_descriptor` — when present, the card renders
 *     `<HeuristicDisclaimer />` inline next to the cited descriptor
 *     value. Per-card placement (rather than section-level) is required
 *     by S6 (#144) so the caveat sits adjacent to the specific data it
 *     qualifies — a visitor scanning a mixed list can tell which row
 *     was mapped from a Western descriptor and which was pure MCP
 *     match, without cross-referencing a header block.
 *   - `flavor_profile` — when present, a six-axis cluster of
 *     `<FlavorAxisLabel />` labels renders under the card. Populated
 *     by the round-2 fan-out in `suggest-action.ts` calling MCP's
 *     `get_sake_details` per brandId; source pinned to `sakenowa` at
 *     the schema seam. Cards whose brand has no chart in the mirror
 *     (MCP returned `flavorProfile: null`) skip the cluster
 *     entirely — no placeholder, no "N/A", per CLAUDE.md § "6-axis
 *     flavor vocabulary" (English-only-label is not the right
 *     fallback for absence; absence is the fallback for absence).
 */

interface SuggestResultsProps {
  suggestions: Suggestion[]
}

export async function SuggestResults({ suggestions }: SuggestResultsProps) {
  const t = await getTranslations('suggest.results')

  // Every rendered suggestion mixes sakenowa (brand fields) with
  // llm_inferred (reason) — attribution is always required. Compute
  // through the shared helper so a future source-taxonomy shift lands
  // here identically.
  const renderedSources = new Set<string>(['sakenowa', 'llm_inferred'])
  const anyCrossBeverage = suggestions.some(
    (s) => s.cross_beverage_descriptor !== undefined,
  )
  if (anyCrossBeverage) renderedSources.add('cross_beverage_map')
  const showSakenowaAttribution = requiresSakenowaAttribution(renderedSources)

  return (
    <section
      className="flex w-full flex-col gap-4"
      aria-label={t('heading')}
      data-testid="suggest-results"
    >
      <h2 className="text-2xl font-semibold">{t('heading')}</h2>
      {showSakenowaAttribution && <SakenowaAttribution placement="above-fold" />}
      <ul className="flex flex-col gap-3" data-testid="suggest-results-list">
        {suggestions.map((s) => (
          <SuggestCard key={s.brandId.value} suggestion={s} />
        ))}
      </ul>
    </section>
  )
}

interface SuggestCardProps {
  suggestion: Suggestion
}

async function SuggestCard({ suggestion }: SuggestCardProps) {
  const t = await getTranslations('suggest.results')

  return (
    <li
      className="flex flex-col gap-2 rounded-md border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950"
      data-testid="suggest-card"
      data-brand-id={suggestion.brandId.value}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <Link
          href={{
            pathname: '/sake/[brandId]',
            params: { brandId: String(suggestion.brandId.value) },
          }}
          className="text-lg font-medium underline underline-offset-4 hover:no-underline focus-visible:no-underline"
          lang="ja"
          data-testid="suggest-card-name-ja"
        >
          {suggestion.name_ja.value}
        </Link>
        <span
          className="text-base text-zinc-600 dark:text-zinc-400"
          lang="en"
          data-testid="suggest-card-name-romaji"
        >
          {suggestion.name_romaji.value}
        </span>
        <SakenowaAttribution placement="inline" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {t('reasonLabel')}
        </p>
        <p
          className="flex items-baseline gap-2 text-sm text-zinc-800 dark:text-zinc-200"
          data-testid="suggest-card-reason"
        >
          <span>{suggestion.reason.value}</span>
          <ProvenanceBadge source={suggestion.reason.source} />
        </p>
      </div>
      {suggestion.cross_beverage_descriptor !== undefined && (
        <div className="flex flex-col gap-2">
          <p
            className="flex items-baseline gap-2 text-xs text-zinc-700 dark:text-zinc-300"
            data-testid="suggest-card-cross-beverage"
          >
            <span lang="en">
              {suggestion.cross_beverage_descriptor.value}
            </span>
            <ProvenanceBadge source={suggestion.cross_beverage_descriptor.source} />
          </p>
          <HeuristicDisclaimer />
        </div>
      )}
      {suggestion.flavor_profile !== undefined && (
        <FlavorAxisCluster profile={suggestion.flavor_profile} />
      )}
    </li>
  )
}

/**
 * Compact six-axis cluster shown at the foot of a suggest card. Renders
 * each of the six brewer's-term axes as a `<FlavorAxisLabel />` (romaji
 * + kanji + tooltip approximation) and the underlying `[0,1]` axis value
 * as a small numeric tag next to it.
 *
 * Not a bar chart / radar — the visual weight of six full-width bars
 * would drown the card copy, and the sake detail page (linked by name
 * at the top of the card) already carries the labelled `FlavorChartView`
 * bars for a visitor who wants to compare axes numerically. The card
 * cluster is a glance-scale summary of the axis names + values so a
 * visitor learning the vocabulary sees the labels reinforced.
 *
 * Every visible number stays behind the axis label so the CLAUDE.md
 * "never English-only" rule holds: romaji + kanji are primary, the
 * numeric value is supporting context, the English approximation
 * arrives via the label's tooltip on hover / focus.
 */
interface FlavorAxisClusterProps {
  profile: NonNullable<Suggestion['flavor_profile']>
}

async function FlavorAxisCluster({ profile }: FlavorAxisClusterProps) {
  const t = await getTranslations('sake.brand')
  const tAxis = await getTranslations('flavorAxis')
  return (
    <FlavorProfileView
      profile={profile}
      variant="cluster"
      chartLabel={t('flavorChartLabel')}
      axisStrings={buildFlavorAxisStrings((axis, field) => tAxis(`${axis}.${field}`))}
    />
  )
}
