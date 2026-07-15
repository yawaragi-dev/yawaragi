'use client'

// `'use client'` is load-bearing: this form owns two <select>s with change
// handlers, a `useTransition` pending state, and calls a Server Action then
// `router.refresh()` to re-render the /profile RSC with the updated radar.

import { type FormEvent, useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { appendDebugEvents } from '@/lib/debug/debug-store'
import { applyCrossBeverage } from '@/lib/taste/taste-actions'
import type { CrossBeverageSeedInput, TasteActionState } from '@/lib/taste/taste-action-state'

type Beverage = CrossBeverageSeedInput['beverage']

const BEVERAGES: readonly Beverage[] = ['whisky', 'wine', 'beer', 'spirit', 'fortified', 'cider']

const SELECT_CLASS =
  'rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50'

interface CrossBeverageSeedFormProps {
  /** Canonical descriptors per beverage, computed server-side from the map. */
  descriptorsByBeverage: Record<Beverage, readonly string[]>
  /** Server-rendered debug flag (the `yawaragi_debug` cookie is HttpOnly). */
  debugMode?: boolean
}

/**
 * The cross-beverage seed form — the cheap, deterministic hero of `/profile`.
 * Pick a drink you love; `applyCrossBeverage` maps it onto the six axes and the
 * page re-renders with the updated taste map. No LLM, unlike `/suggest`.
 */
export function CrossBeverageSeedForm({
  descriptorsByBeverage,
  debugMode = false,
}: CrossBeverageSeedFormProps) {
  const t = useTranslations('profile')
  const tBeverage = useTranslations('profile.beverage')
  const router = useRouter()
  const [beverage, setBeverage] = useState<Beverage>('whisky')
  const [descriptor, setDescriptor] = useState<string>(descriptorsByBeverage.whisky[0] ?? '')
  const [result, setResult] = useState<TasteActionState | null>(null)
  const [isPending, startTransition] = useTransition()

  const options = descriptorsByBeverage[beverage] ?? []

  function onBeverageChange(next: Beverage) {
    setBeverage(next)
    // Reset the descriptor to the first valid one for the new beverage so the
    // pair is never stale (a descriptor from the old category).
    setDescriptor(descriptorsByBeverage[next]?.[0] ?? '')
    setResult(null)
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    startTransition(async () => {
      if (debugMode) {
        appendDebugEvents([
          {
            tMs: 0,
            source: 'TasteAction',
            level: 'info',
            message: `seed submit: ${beverage}/${descriptor}`,
          },
        ])
      }
      const next = await applyCrossBeverage({ descriptor, beverage })
      setResult(next)
      if (debugMode && next.debugLog) appendDebugEvents(next.debugLog)
      // Reward on success: re-fetch the RSC so the visitor's updated radar +
      // provenance replace this state — their taste map now includes the seed.
      if (next.status === 'ok') router.refresh()
    })
  }

  return (
    <form onSubmit={onSubmit} data-testid="cross-beverage-seed-form" className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="seed-beverage" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            {t('seedBeverageLabel')}
          </label>
          <select
            id="seed-beverage"
            value={beverage}
            onChange={(e) => onBeverageChange(e.target.value as Beverage)}
            disabled={isPending}
            data-testid="seed-beverage"
            className={SELECT_CLASS}
          >
            {BEVERAGES.map((b) => (
              <option key={b} value={b}>
                {tBeverage(b)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="seed-descriptor" className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            {t('seedDescriptorLabel')}
          </label>
          <select
            id="seed-descriptor"
            value={descriptor}
            onChange={(e) => setDescriptor(e.target.value)}
            disabled={isPending}
            data-testid="seed-descriptor"
            className={SELECT_CLASS}
          >
            {options.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </div>

      <Button
        type="submit"
        disabled={isPending}
        aria-busy={isPending}
        data-testid="seed-submit"
        className="w-fit"
      >
        {isPending ? t('seedPending') : t('seedSubmit')}
      </Button>

      {result && result.status !== 'ok' && (
        <p
          role="alert"
          data-testid="seed-error"
          className="text-sm text-amber-700 dark:text-amber-300"
        >
          {result.status === 'unknown_descriptor'
            ? t('seedUnknownDescriptor')
            : result.status === 'rate_limited'
              ? t('seedRateLimited', { hours: Math.max(1, Math.ceil(result.retryAfterSec / 3600)) })
              : result.status === 'invalid_input'
                ? t('seedInvalid')
                : t('seedUnavailable')}
        </p>
      )}
    </form>
  )
}
