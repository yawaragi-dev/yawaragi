import { getTranslations } from 'next-intl/server'
import type { ProvenanceSource } from '@/lib/schemas/with-provenance'
import { resolveBadgeKind } from '@/lib/provenance/policy'
import { ProvenanceBadgeView } from './provenance-badge-view'

// Re-exported so the five client callers keep importing from one path. The
// view had to move to its own `'use client'` file once it opened a sheet, and
// this file's async server wrapper cannot live in a client module.
export { ProvenanceBadgeView } from './provenance-badge-view'

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
  /** Unique per badge instance — see the view's `id` for why per-kind broke. */
  id: string
  className?: string
}

// The `source → BadgeKind` mapping (`SOURCE_TO_KIND`) and the `BadgeKind`
// type now live in `@/lib/provenance/policy` so this async server wrapper
// and the `'use client'` scan callers resolve the kind through one seam
// (#198) — no more hardcoded `kind="..."` literals re-encoding the map.

export async function ProvenanceBadge({
  source,
  confidence,
  id,
  className,
}: ProvenanceBadgeProps) {
  const kind = resolveBadgeKind(source)
  // `null` for canonical sources — the policy's single decision point for
  // "does this source get a badge". Callers can always mount the badge next
  // to a value and let the policy decide whether anything renders.
  if (!kind) return null

  const t = await getTranslations(`provenance.badge.${kind}`)
  const tSheet = await getTranslations('provenance.sheet')
  return (
    <ProvenanceBadgeView
      kind={kind}
      label={t('label')}
      explanation={t('explanation')}
      sheetTitle={t('sheetTitle')}
      closeLabel={tSheet('closeLabel')}
      confidence={confidence}
      id={id}
      className={className}
    />
  )
}
