import { getTranslations } from 'next-intl/server'
import { cn } from '@/lib/utils'

/**
 * Phase 4 / S3a (#142 sub-slice): the always-visible disclaimer
 * mandated by CLAUDE.md § "Cross-beverage disclaimers" for any UI
 * surface that renders `cross_beverage_map`-sourced output.
 *
 * Presentation (UX-F #167 density pass): a compact affordance, not a
 * full block — the earlier always-visible box dominated the scan card and
 * repeated down the `/suggest` list. The **title** ("These are cross-
 * beverage approximations") stays visible as the caveat cue next to every
 * cross-beverage result; the longer **body** ("Western descriptors…")
 * tucks into a tooltip on an info button, revealed on hover / keyboard
 * focus / tap. The body is ALWAYS in the DOM and wired via
 * `aria-describedby`, so screen readers reach the full caveat — including
 * the JMStV discovery-framing sentence — without any interaction. This
 * keeps the CLAUDE.md mandate ("every cross-beverage recommendation MUST
 * render with `<HeuristicDisclaimer />`", caveat carried next to the
 * result) while shrinking the footprint. Pure CSS (no `use client`) — the
 * native `<button>` + `group-*` reveal work in both the server-rendered
 * `/suggest` surface and the client scan card.
 *
 * Distinct from `<ProvenanceBadge source="cross_beverage_map" />`: the
 * badge marks a *specific value* as cross-beverage-sourced; this marks the
 * *recommendation* with the honesty caveat.
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
  const tooltipId = 'heuristic-disclaimer-tooltip'
  // `role="note"` is the WAI-ARIA pattern for a parenthetical that
  // supplements the surrounding content without being part of the main
  // reading flow. The visible title is the caveat cue; the info button
  // carries `aria-describedby` → the body, so a screen reader announces
  // the full caveat when the button is reached. The body sits in a
  // `role="tooltip"` that's always in the DOM (opacity-toggled, not
  // conditionally rendered) and revealed on hover / focus / tap.
  return (
    <span
      role="note"
      className={cn(
        // Quiet "footnote" treatment (not amber/warning): the caveat is
        // helpful context, not an alert, so it recedes into the layout as a
        // calm neutral aside. Styling only — the title-visible + body-in-
        // tooltip structure stays (CLAUDE.md).
        'group relative inline-flex w-fit items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400',
        className,
      )}
      data-testid="heuristic-disclaimer"
    >
      <span
        className="font-medium text-zinc-700 dark:text-zinc-300"
        data-testid="heuristic-disclaimer-title"
      >
        {title}
      </span>
      <button
        type="button"
        aria-label={title}
        aria-describedby={tooltipId}
        className="inline-flex items-center justify-center rounded-full text-zinc-400 hover:text-zinc-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 dark:text-zinc-500 dark:hover:text-zinc-300"
      >
        <InfoIcon />
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className={cn(
          // max-w caps to the viewport on mobile so a disclaimer near a screen
          // edge can't push its tooltip off-screen.
          'pointer-events-none absolute left-0 top-full z-10 mt-1 w-max max-w-[min(20rem,80vw)]',
          'rounded-md border border-zinc-200 bg-white px-3 py-2 leading-snug text-zinc-700 shadow-md',
          'opacity-0 transition-opacity duration-150',
          'group-hover:opacity-100 group-focus-within:opacity-100',
          'dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300',
        )}
        data-testid="heuristic-disclaimer-body"
      >
        {body}
      </span>
    </span>
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
      className="size-3.5 flex-shrink-0"
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
