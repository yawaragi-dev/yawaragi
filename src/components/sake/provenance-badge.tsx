import { getTranslations } from 'next-intl/server'
import type { ProvenanceSource } from '@/lib/schemas/with-provenance'
import { shouldRenderBadge } from '@/lib/provenance/policy'
import { cn } from '@/lib/utils'

/**
 * Renders a small badge advertising that a displayed value did not come
 * straight from a canonical reference (Sakenowa, manual curation, user
 * correction). Returns `null` for canonical sources so callers can
 * always import the badge next to a value and let the policy decide
 * whether anything is shown — no caller-side conditional needed.
 *
 * The three badged sources each get a visually distinct treatment
 * (color + label) so a recommendation card mixing Sakenowa data with
 * an LLM tasting note and a cross-beverage hint is glance-readable
 * (CLAUDE.md "Never blend sources silently").
 *
 * Split into a sync presentational view + async i18n wrapper because
 * Vitest can't render async RSCs (CLAUDE.md). The view takes resolved
 * strings; unit tests target it. The wrapper does the locale work.
 *
 * Optional `confidence` (0..1) is rendered as a subtle text suffix when
 * present. A meter or chart would over-promise a metadata badge — the
 * percentage is a hint, not a calibrated probability.
 */

interface ProvenanceBadgeProps {
  source: ProvenanceSource
  confidence?: number
  className?: string
}

// Keyed by the i18n message subkey so the view stays free of source-string
// branching. `satisfies` ensures every non-canonical source has a key.
type BadgeKind = 'llmExtracted' | 'llmInferred' | 'crossBeverageMap'

const SOURCE_TO_KIND: Partial<Record<ProvenanceSource, BadgeKind>> = {
  llm_extracted: 'llmExtracted',
  llm_inferred: 'llmInferred',
  cross_beverage_map: 'crossBeverageMap',
} satisfies Partial<Record<ProvenanceSource, BadgeKind>>

export async function ProvenanceBadge({
  source,
  confidence,
  className,
}: ProvenanceBadgeProps) {
  if (!shouldRenderBadge(source)) return null
  const kind = SOURCE_TO_KIND[source]
  // Narrowed by `shouldRenderBadge`, but TS can't see through the
  // policy boundary; the runtime guard is a belt-and-braces.
  if (!kind) return null

  const t = await getTranslations(`provenance.badge.${kind}`)
  return (
    <ProvenanceBadgeView
      kind={kind}
      label={t('label')}
      tooltip={t('tooltip')}
      confidence={confidence}
      className={className}
    />
  )
}

interface ProvenanceBadgeViewProps {
  kind: BadgeKind
  label: string
  tooltip: string
  confidence?: number
  className?: string
}

// Per-kind Tailwind palette. Distinct enough at a glance, but all stay
// subtle (this is a metadata chip on a content surface, not a CTA).
const KIND_STYLES: Record<BadgeKind, string> = {
  llmExtracted:
    'border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-700 dark:bg-violet-950 dark:text-violet-100',
  llmInferred:
    'border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100',
  crossBeverageMap:
    'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100',
}

export function ProvenanceBadgeView({
  kind,
  label,
  tooltip,
  confidence,
  className,
}: ProvenanceBadgeViewProps) {
  const tooltipId = `provenance-badge-${kind}-tooltip`
  // Clamp + percentage formatting in the view so a caller passing a
  // sloppy value (e.g. 1.0001 from a softmax) still renders cleanly.
  const confidencePct =
    typeof confidence === 'number'
      ? Math.round(Math.max(0, Math.min(1, confidence)) * 100)
      : undefined

  return (
    <span
      className={cn(
        'group relative inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        KIND_STYLES[kind],
        className,
      )}
      tabIndex={0}
      aria-describedby={tooltipId}
      data-testid="provenance-badge"
      data-kind={kind}
    >
      <span data-testid="provenance-badge-label">{label}</span>
      {confidencePct !== undefined && (
        <span
          className="text-[0.65rem] tabular-nums opacity-75"
          data-testid="provenance-badge-confidence"
          aria-label={`${confidencePct}%`}
        >
          {confidencePct}%
        </span>
      )}
      <span
        id={tooltipId}
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-0 top-full z-10 mt-1 w-max max-w-xs',
          'rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs font-normal leading-snug text-zinc-800 shadow-md',
          'opacity-0 transition-opacity duration-150',
          'group-hover:opacity-100 group-focus-visible:opacity-100 group-focus-within:opacity-100',
          'dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100',
        )}
        data-testid="provenance-badge-tooltip"
      >
        {tooltip}
      </span>
    </span>
  )
}
