import { getTranslations } from 'next-intl/server'
import { FLAVOR_AXIS_ROMAJI, type FlavorAxis } from '@/lib/schemas/flavor-chart'
import { cn } from '@/lib/utils'

/**
 * Renders one of the six Sakenowa flavor-chart axes with romaji + kanji
 * always visible and the locale's approximation + brewer's-term caveat
 * available via tooltip.
 *
 * Why both romaji and kanji are forced visible: the project's "never
 * English-only" rule (CLAUDE.md) — Japanese brewer's terms have no exact
 * Western equivalent, so the canonical labels stay primary and the
 * locale approximation is supporting context, not a replacement.
 *
 * Split into a sync presentational view + async i18n wrapper because
 * Vitest can't render async RSCs (CLAUDE.md). The view takes resolved
 * strings; unit tests assert on it. The wrapper does the locale work.
 */
/**
 * Which way the tooltip opens, so a label near a container/viewport edge
 * doesn't push its tooltip off-screen. `left` (the default) anchors the
 * tooltip's left edge and opens rightward — correct for a left-aligned label.
 * The radar positions labels around a hexagon and passes `right` for its
 * right-side axes and `center` for top/bottom so no tooltip overflows.
 */
export type TooltipAlign = 'left' | 'center' | 'right'

const TOOLTIP_ALIGN_CLASS: Record<TooltipAlign, string> = {
  left: 'left-0',
  center: 'left-1/2 -translate-x-1/2',
  right: 'right-0',
}

interface FlavorAxisLabelProps {
  axis: FlavorAxis
  className?: string
  tooltipAlign?: TooltipAlign
}

export async function FlavorAxisLabel({ axis, className, tooltipAlign }: FlavorAxisLabelProps) {
  const t = await getTranslations('flavorAxis')
  return (
    <FlavorAxisLabelView
      axis={axis}
      romaji={FLAVOR_AXIS_ROMAJI[axis]}
      kanji={t(`${axis}.kanji`)}
      approximation={t(`${axis}.label`)}
      caveat={t(`${axis}.caveat`)}
      className={className}
      tooltipAlign={tooltipAlign}
    />
  )
}

interface FlavorAxisLabelViewProps {
  axis: FlavorAxis
  romaji: string
  kanji: string
  approximation: string
  caveat: string
  className?: string
  tooltipAlign?: TooltipAlign
}

// The tooltip body is always present in the DOM (referenced via
// `aria-describedby`) so screen readers reach it without JS. CSS toggles
// visual visibility on focus/hover; SR announces the description either
// way. `tabIndex={0}` makes the label keyboard-reachable.
export function FlavorAxisLabelView({
  axis,
  romaji,
  kanji,
  approximation,
  caveat,
  className,
  tooltipAlign = 'left',
}: FlavorAxisLabelViewProps) {
  const tooltipId = `flavor-axis-${axis}-tooltip`

  return (
    <span
      className={cn('group relative inline-flex flex-col items-start gap-0.5', className)}
      tabIndex={0}
      aria-describedby={tooltipId}
      data-testid={`flavor-axis-${axis}`}
    >
      <span
        className="text-xs font-medium uppercase tracking-wide text-zinc-700 dark:text-zinc-300"
        data-testid={`flavor-axis-${axis}-romaji`}
      >
        {romaji}
      </span>
      <span
        className="text-sm font-semibold"
        lang="ja"
        data-testid={`flavor-axis-${axis}-kanji`}
      >
        {kanji}
      </span>
      <span
        id={tooltipId}
        role="tooltip"
        className={cn(
          'pointer-events-none absolute top-full z-10 mt-1 w-max max-w-[min(16rem,80vw)]',
          TOOLTIP_ALIGN_CLASS[tooltipAlign],
          'rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs leading-snug shadow-md',
          'opacity-0 transition-opacity duration-150',
          'group-hover:opacity-100 group-focus-visible:opacity-100 group-focus-within:opacity-100',
          'dark:border-zinc-700 dark:bg-zinc-900',
        )}
        data-testid={`flavor-axis-${axis}-tooltip`}
      >
        <span className="font-medium">{approximation}</span>
        <span className="mt-1 block text-zinc-600 dark:text-zinc-400">{caveat}</span>
      </span>
    </span>
  )
}
