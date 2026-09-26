import { getTranslations } from 'next-intl/server'
import type { FlavorAxis } from '@/lib/schemas/flavor-chart'
import { cn } from '@/lib/utils'

/**
 * One of the six Sakenowa flavour axes, rendered as the locale's English (or
 * German) approximation: Floral, Mellow, Rich, Mild, Dry, Light.
 *
 * This used to show romaji + kanji inline with the approximation in a
 * per-axis tooltip, under an absolute "never English-only" rule. **ADR-0022
 * moved that disclosure rather than deleting it**: the info button beside the
 * chart heading opens `<FlavorTermsSheet />`, which names all six brewers'
 * terms at once and states plainly that the English words are approximations,
 * not translations. One sheet beats six tooltips — six rows × three lines,
 * twice per screen, lost more to legibility than the inline Japanese bought
 * in accuracy at 390px in a dim room.
 *
 * So this component is deliberately thin, and the compliance weight sits on
 * the chart container. **A chart that renders these labels without also
 * rendering the disclosure is a regression against ADR-0022** — that is what
 * `flavor-profile-view.test.tsx` pins, not anything in this file.
 *
 * Romaji is untouched below the presentation layer: `FLAVOR_AXIS_ROMAJI`
 * still maps the axes, the enum is still `f1..f6`, and LLM prompts still
 * speak romaji + kanji.
 *
 * Split into a sync view + async i18n wrapper because Vitest can't render
 * async RSCs (CLAUDE.md).
 */

interface FlavorAxisLabelProps {
  axis: FlavorAxis
  className?: string
}

export async function FlavorAxisLabel({ axis, className }: FlavorAxisLabelProps) {
  const t = await getTranslations('flavorAxis')
  return (
    <FlavorAxisLabelView
      axis={axis}
      approximation={t(`${axis}.label`)}
      className={className}
    />
  )
}

interface FlavorAxisLabelViewProps {
  axis: FlavorAxis
  approximation: string
  className?: string
}

export function FlavorAxisLabelView({
  axis,
  approximation,
  className,
}: FlavorAxisLabelViewProps) {
  return (
    <span
      // The id is load-bearing: each axis bar points its `aria-labelledby`
      // here, so this is the bar's accessible name. Renaming it without
      // updating `<Bar />` silently unlabels all six progressbars.
      id={`flavor-axis-${axis}-label`}
      className={cn('text-section-label text-ash-700', className)}
      data-testid={`flavor-axis-${axis}`}
    >
      {approximation}
    </span>
  )
}
