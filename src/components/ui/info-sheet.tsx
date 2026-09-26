'use client'

import type { ReactNode } from 'react'
import { Info, X } from '@phosphor-icons/react/dist/ssr'
import { cn } from '@/lib/utils'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

/**
 * The canonical disclosure pattern for **every inferred or approximate
 * claim** (design v1.4 §16). Three parts, all required:
 *
 *   1. a short caveat line, always rendered, never behind an interaction;
 *   2. an info button whose `aria-describedby` points at that caveat, so a
 *      screen reader gets the caveat on reaching the button without opening
 *      anything;
 *   3. a bottom sheet carrying the full explanation.
 *
 * This generalises the shape `<HeuristicDisclaimer />` arrived at in the
 * UX-F density pass (#167) — visible cue, full text reachable — and upgrades
 * the reveal from a hover tooltip to a sheet, because the explanations the
 * design writes are paragraphs, not a sentence, and a hover tooltip is a
 * poor target on the phone this product is built for.
 *
 * **The caveat is not decorative.** ADR-0022 leans on it: the flavour axes
 * render as English approximations only *because* this pattern carries the
 * "these are brewers' terms" disclosure. A chart that drops the sheet is a
 * regression against the ADR, not just against the design. Same for
 * cross-beverage output under CLAUDE.md.
 *
 * `'use client'` is unavoidable — the sheet has open state. Everything it
 * renders is text passed in as props, so server callers resolve their own
 * strings and this stays a leaf island rather than pulling a subtree across
 * the boundary. Phosphor icons come from the `/dist/ssr` entry, which emits
 * plain SVG with no context provider.
 */
export interface InfoSheetProps {
  /** The always-visible caveat line. Kept short — one clause. */
  caveat: string
  /** Accessible name for the info button (e.g. "Why?"). The caveat itself
   *  is the button's *description*, so this should say what opening it
   *  does, not repeat the caveat. */
  triggerLabel: string
  /** Sheet heading, 19px per the spec. */
  title: string
  /** Accessible name for the close button. */
  closeLabel: string
  /** The full explanation. */
  children: ReactNode
  /** Distinguishes this instance's caveat element. Required because a page
   *  can carry several disclosures (a chart and a cross-beverage line on the
   *  same card) and duplicate ids would misdirect `aria-describedby`. */
  id: string
  className?: string
}

export function InfoSheet({
  caveat,
  triggerLabel,
  title,
  closeLabel,
  children,
  id,
  className,
}: InfoSheetProps) {
  const caveatId = `info-sheet-${id}-caveat`

  return (
    <span
      // `role="note"` is the WAI-ARIA pattern for a parenthetical that
      // supplements the surrounding content without joining the main
      // reading flow — the same role `<HeuristicDisclaimer />` uses.
      role="note"
      className={cn('inline-flex w-fit items-center gap-1.5', className)}
      data-testid={`info-sheet-${id}`}
    >
      <span
        id={caveatId}
        className="text-section-label leading-snug text-ash-700"
        data-testid={`info-sheet-${id}-caveat`}
      >
        {caveat}
      </span>
      <Sheet>
        <SheetTrigger
          render={
            <button
              type="button"
              aria-label={triggerLabel}
              aria-describedby={caveatId}
              // 44px tap target via the negative-margin trick: the visual
              // dot stays 16px and inline with the caveat, but the hit area
              // meets the touch-target floor. Without this the button is a
              // 16px target in the middle of a text line.
              className="-m-3 inline-flex size-11 items-center justify-center rounded-full text-ash-600 transition-colors hover:text-ginshu-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ginshu-600"
              data-testid={`info-sheet-${id}-trigger`}
            />
          }
        >
          <Info size={16} aria-hidden="true" />
        </SheetTrigger>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          overlayClassName="bg-black/55 supports-backdrop-filter:backdrop-blur-none"
          className="max-h-[90dvh] gap-0 overflow-y-auto rounded-t-[20px] border-0 bg-surface p-0 text-ink shadow-yw-lg"
          data-testid={`info-sheet-${id}-panel`}
        >
          <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
            <SheetTitle className="text-lg-alt font-medium text-ink">
              {title}
            </SheetTitle>
            <SheetClose
              render={
                <button
                  type="button"
                  aria-label={closeLabel}
                  className="-mt-2 -mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-ash-600 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ginshu-600"
                  data-testid={`info-sheet-${id}-close`}
                />
              }
            >
              <X size={18} aria-hidden="true" />
            </SheetClose>
          </div>
          <div className="px-5 pb-8 text-secondary leading-relaxed text-ash-700">
            {children}
          </div>
        </SheetContent>
      </Sheet>
    </span>
  )
}
