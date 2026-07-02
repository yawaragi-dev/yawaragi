import { getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { HeuristicDisclaimer } from '@/components/legal/heuristic-disclaimer'
import { ProvenanceBadge } from '@/components/sake/provenance-badge'
import {
  SakenowaAttribution,
  requiresSakenowaAttribution,
} from '@/components/sake/sakenowa-attribution'
import type { Suggestion } from '@/lib/schemas/suggestion'

/**
 * Phase 4 / S5 (#143) — RSC card list for the suggest results page.
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
 *   - `cross_beverage_descriptor` — when present, the whole card list
 *     mounts `<HeuristicDisclaimer />` at the top (once, not per-card —
 *     the disclaimer is section-level context per its docstring).
 *
 * No 6-axis flavor cluster in S5. The MCP `find_similar_sakes` tool
 * returns brandId + name; the LLM's reason cites axes in prose (per the
 * system prompt) but the deterministic chart lives on the sake detail
 * page. A future slice can inline `<FlavorAxisLabel />` clusters per
 * card once the recommender routinely emits axis positions in the tool
 * chain.
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
      {anyCrossBeverage && <HeuristicDisclaimer />}
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
        <p
          className="flex items-baseline gap-2 text-xs text-zinc-700 dark:text-zinc-300"
          data-testid="suggest-card-cross-beverage"
        >
          <span lang="en">
            {suggestion.cross_beverage_descriptor.value}
          </span>
          <ProvenanceBadge source={suggestion.cross_beverage_descriptor.source} />
        </p>
      )}
    </li>
  )
}
