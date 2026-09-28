'use client'

import { Sheet, SheetTrigger } from '@/components/ui/sheet'
import { InfoSheetPanel } from '@/components/ui/info-sheet'
import type { BadgeKind } from '@/lib/provenance/policy'
import { cn } from '@/lib/utils'

/**
 * The provenance badge, ported onto §16's info-sheet pattern.
 *
 * **It used to be a hover tooltip, and the tooltip did not fit the screen.**
 * `absolute left-0 top-full w-max max-w-xs` puts a 320px panel at the badge's
 * left edge; measured on `/en/sake/101` at 390px the badge sits at x=141, so
 * the panel ran to x=462 — 72px past the viewport. Before the app shell that
 * showed up as the *page* panning sideways; once `<main>` became the scroll
 * container it showed up as text cut off mid-sentence, which is what a
 * reviewer reported. No amount of width clamping fixes it: the box is anchored
 * to the badge, so a badge right of centre overflows however narrow the panel
 * is. Flipping the anchor just overflows the other way.
 *
 * §16 is the design's answer, and CLAUDE.md says so in as many words: the
 * info-sheet pattern is "the canonical pattern for **every** inferred or
 * approximate claim — reuse it for every inferred claim, not just
 * cross-beverage". A bottom sheet is viewport-sized by construction, so the
 * class of bug disappears rather than being tuned.
 *
 * **The badge is the trigger, not a sibling of one.** §16's usual shape is a
 * caveat line plus an info button, but the badge already *is* the caveat cue —
 * adding a second control beside every chip would put two controls where the
 * design has one, on a card that can carry three badges.
 *
 * **The explanation stays in the DOM.** A sheet's content is unmounted while
 * closed, so relying on it alone would take the explanation away from screen
 * readers until someone opened the sheet — the opposite of what the badge is
 * for. The `sr-only` copy is what `aria-describedby` points at, so assistive
 * tech reaches it with no interaction at all, exactly as before. Same
 * principle `<HeuristicDisclaimer />` follows, and the same reason CLAUDE.md
 * forbids "fixing" that one into a hover-only control.
 */

interface ProvenanceBadgeViewProps {
  kind: BadgeKind
  label: string
  /** One sentence: what this source means and how far to trust it. */
  explanation: string
  /** Sheet heading. */
  sheetTitle: string
  /** Accessible name for the sheet's close button. */
  closeLabel: string
  confidence?: number
  /**
   * Unique per badge **instance**, not per kind.
   *
   * The previous id was `provenance-badge-${kind}-tooltip`, which collides the
   * moment one card carries two badges of the same kind — and the scan result
   * card carries exactly that, one on the sake name and one on the brewery.
   * Two elements shared an id and `aria-describedby` resolved to whichever
   * came first. `<InfoSheet />` requires an explicit `id` for this same reason
   * and says so in its own docs; this now matches.
   */
  id: string
  className?: string
}

// Per-kind palette. Distinct at a glance — CLAUDE.md's "never blend sources
// silently" — but subtle: this is a metadata chip on a content surface, not a
// CTA. The palette itself is still pre-Ginshu and is #308's question for the
// designers; this change is the interaction, not the colour.
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
  explanation,
  sheetTitle,
  closeLabel,
  confidence,
  id,
  className,
}: ProvenanceBadgeViewProps) {
  const descriptionId = `provenance-badge-${id}-description`
  // Clamp + format here so a caller passing a sloppy value (1.0001 out of a
  // softmax) still renders cleanly.
  const confidencePct =
    typeof confidence === 'number'
      ? Math.round(Math.max(0, Math.min(1, confidence)) * 100)
      : undefined

  return (
    <>
      <Sheet>
        <SheetTrigger
          render={
            <button
              type="button"
              aria-describedby={descriptionId}
              className={cn(
                'inline-flex cursor-pointer items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ginshu-600',
                KIND_STYLES[kind],
                className,
              )}
              data-testid="provenance-badge"
              data-kind={kind}
            />
          }
        >
          <span data-testid="provenance-badge-label">{label}</span>
          {confidencePct !== undefined && (
            <span
              className="text-[0.65rem] tabular-nums opacity-75"
              data-testid="provenance-badge-confidence"
            >
              {confidencePct}%
            </span>
          )}
        </SheetTrigger>
        <InfoSheetPanel title={sheetTitle} closeLabel={closeLabel} id={`provenance-${id}`}>
          {explanation}
        </InfoSheetPanel>
      </Sheet>
      <span id={descriptionId} className="sr-only" data-testid="provenance-badge-description">
        {explanation}
      </span>
    </>
  )
}
