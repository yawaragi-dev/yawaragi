import { getTranslations } from 'next-intl/server'
import { cn } from '@/lib/utils'

/**
 * Phase 4 / S3a (#142 sub-slice): the always-visible disclaimer
 * mandated by CLAUDE.md § "Cross-beverage disclaimers" for any UI
 * surface that renders `cross_beverage_map`-sourced output.
 *
 * Distinction from `<ProvenanceBadge source="cross_beverage_map" />`:
 *
 *   - The badge is a small per-value chip with a hover/focus tooltip.
 *     It tells the visitor that a *specific* value came from the
 *     cross-beverage map.
 *   - This component is an always-visible *block* placed near
 *     cross-beverage results — typically once per card list or section.
 *     The disclaimer is readable without hover, satisfying the CLAUDE.md
 *     rule that "every cross-beverage recommendation MUST render with
 *     `<HeuristicDisclaimer />`".
 *
 * Both surfaces render the same caveat ("Western descriptors do not
 * translate exactly to sake") but at different granularities:
 * per-value affordance vs. section-level transparency.
 *
 * Split into a sync presentational view + async i18n wrapper because
 * Vitest can't render async RSCs (CLAUDE.md). The view takes resolved
 * strings; unit tests target it. The wrapper does the locale work.
 */

interface HeuristicDisclaimerProps {
  className?: string
}

export async function HeuristicDisclaimer({ className }: HeuristicDisclaimerProps = {}) {
  const t = await getTranslations('heuristicDisclaimer')
  return (
    <HeuristicDisclaimerView
      title={t('title')}
      body={t('body')}
      className={className}
    />
  )
}

interface HeuristicDisclaimerViewProps {
  title: string
  body: string
  className?: string
}

export function HeuristicDisclaimerView({
  title,
  body,
  className,
}: HeuristicDisclaimerViewProps) {
  // `role="note"` is the WAI-ARIA pattern for a parenthetical block
  // that supplements the surrounding content without being part of
  // the main reading flow. Screen-reader users get an explicit cue
  // that this is a side-comment about the cross-beverage results, not
  // a result itself.
  return (
    <aside
      role="note"
      className={cn(
        'flex w-full items-start gap-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100',
        className,
      )}
      data-testid="heuristic-disclaimer"
    >
      <InfoIcon />
      <div className="flex flex-col gap-1">
        <p className="font-medium" data-testid="heuristic-disclaimer-title">
          {title}
        </p>
        <p className="text-amber-800 dark:text-amber-200" data-testid="heuristic-disclaimer-body">
          {body}
        </p>
      </div>
    </aside>
  )
}

/**
 * Inline SVG kept tiny (no lucide-react dep here) so the disclaimer
 * has no JS payload — it ships as pure RSC HTML. The `aria-hidden`
 * matters: the icon is decorative; the surrounding `role="note"`
 * already conveys the semantics.
 */
function InfoIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="mt-0.5 size-4 flex-shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 5h.01" />
      <path d="M7.25 8h.75v3h.75" />
    </svg>
  )
}
