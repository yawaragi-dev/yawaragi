'use client'

// `'use client'` is load-bearing: the chips hold a selection, run a Server
// Action in a transition, and call `router.refresh()` so the palate above them
// re-renders with the seed applied.

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { HeuristicDisclaimerView } from '@/components/legal/heuristic-disclaimer'
import { appendDebugEvents } from '@/lib/debug/debug-store'
import { applyCrossBeverage } from '@/lib/taste/taste-actions'
import type { TasteActionState } from '@/lib/taste/taste-action-state'
import type { Beverage } from '@/lib/cross-beverage/cold-start-chips'
import { cn } from '@/lib/utils'

/**
 * §12's "Start from a drink you know" — the cross-beverage cold start.
 *
 * This replaces a pair of `<select>`s offering the cross-beverage table's 62
 * **descriptors** ("peated", "off-dry", "roasty"). Those are the curation's
 * internal words; §12 names five bottles instead, and a visitor knows what
 * Guinness is where "roasty" is a term they have to decode. The seed a chip
 * produces is identical — same descriptor, same row, same action — so the
 * change is which word the visitor reads, not what the app computes.
 *
 * The reach narrows from 62 descriptors to 5 drinks, deliberately: this is a
 * cold start, where a shorter list of recognisable things beats a complete
 * list of unfamiliar ones. The full table is still what `/suggest` and the
 * scan card read.
 *
 * CLAUDE.md § "Cross-beverage disclaimers": the mapping is a hand-curated
 * heuristic, so `<HeuristicDisclaimer />` is mandatory here — title visible,
 * body in the info button, caveat text in the DOM via `aria-describedby`.
 */

export interface ColdStartChipView {
  name: string
  region?: string
  descriptor: string
  beverage: Beverage
  /**
   * The "expect to like…" line, resolved on the server.
   *
   * Derived from the row's own axes rather than written per descriptor: the
   * table has 62 rows and each one would need editorial copy in two locales,
   * which is how a line drifts out of agreement with the vector it describes.
   */
  seedLine: string
}

export function ColdStartChips({
  chips,
  debugMode = false,
}: {
  chips: readonly ColdStartChipView[]
  debugMode?: boolean
}) {
  const t = useTranslations('palate.coldStart')
  const tDisclaimer = useTranslations('heuristicDisclaimer')
  const router = useRouter()
  const [picked, setPicked] = useState<string | null>(null)
  const [result, setResult] = useState<TasteActionState | null>(null)
  const [isPending, startTransition] = useTransition()

  function pick(chip: ColdStartChipView) {
    // Selection lands BEFORE the action runs. #184: a tap whose only feedback
    // arrives with the server's answer reads as a tap that did nothing.
    setPicked(chip.name)
    setResult(null)
    startTransition(async () => {
      if (debugMode) {
        appendDebugEvents([
          {
            tMs: 0,
            source: 'TasteAction',
            level: 'info',
            message: `cold-start chip: ${chip.name} → ${chip.beverage}/${chip.descriptor}`,
          },
        ])
      }
      const next = await applyCrossBeverage({
        descriptor: chip.descriptor,
        beverage: chip.beverage,
      })
      setResult(next)
      if (debugMode && next.debugLog) appendDebugEvents(next.debugLog)
      // The reward: the palate above re-renders with the seed in it.
      if (next.status === 'ok') router.refresh()
    })
  }

  const pickedChip = chips.find((chip) => chip.name === picked) ?? null

  return (
    <section
      className="flex flex-col gap-3 rounded-xl bg-surface p-4 shadow-yw-sm"
      data-testid="palate-cold-start"
    >
      {/* The accent "mark": a 2px × 14px rule before the heading, one per
          surface. */}
      <h2 className="flex items-center gap-2 text-card-heading font-medium text-ink">
        <span aria-hidden="true" className="block h-3.5 w-0.5 rounded-full bg-ginshu-500" />
        {t('heading')}
      </h2>
      <p className="text-body text-ash-600">{t('body')}</p>

      <ul className="flex flex-wrap gap-2" role="list">
        {chips.map((chip) => {
          const isPicked = chip.name === picked
          return (
            <li key={chip.name}>
              <button
                type="button"
                onClick={() => pick(chip)}
                disabled={isPending}
                aria-pressed={isPicked}
                data-testid={`palate-cold-start-chip-${chip.descriptor}`}
                className={cn(
                  'inline-flex min-h-9 items-center rounded-full px-3.5 text-body transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600 disabled:opacity-60',
                  // "Selected chip: 600 fill with #1b1a19 text" — the design
                  // is explicit, and it is the only place the accent fills a
                  // surface this small.
                  isPicked
                    ? 'bg-ginshu-600 text-ground'
                    : 'bg-ash-200 text-ink hover:bg-ash-300',
                )}
              >
                {/* Exemplar names are proper nouns and stay verbatim across
                    locales — "Riesling Spätlese" is not translated. */}
                {chip.name}
              </button>
            </li>
          )
        })}
      </ul>

      {pickedChip && (
        <p className="text-body text-ash-700" data-testid="palate-cold-start-seed-line">
          {pickedChip.seedLine}
        </p>
      )}

      <HeuristicDisclaimerView title={tDisclaimer('title')} body={tDisclaimer('body')} />

      {result && result.status !== 'ok' && (
        <p role="alert" className="text-body text-ginshu-700" data-testid="palate-cold-start-error">
          {result.status === 'unknown_descriptor'
            ? t('errorUnknown')
            : result.status === 'rate_limited'
              ? t('errorRateLimited', {
                  hours: Math.max(1, Math.ceil(result.retryAfterSec / 3600)),
                })
              : result.status === 'invalid_input'
                ? t('errorInvalid')
                : t('errorUnavailable')}
        </p>
      )}
    </section>
  )
}
