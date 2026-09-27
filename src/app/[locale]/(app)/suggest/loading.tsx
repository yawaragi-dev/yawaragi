import { getTranslations } from 'next-intl/server'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Phase 4 / S6 (#144) — loading UI for `/[locale]/suggest`.
 *
 * Next.js route-segment loading boundary. Fires while the RSC `page.tsx`
 * is streaming — which for the seed / freeform paths means the ~2–8 s
 * span the LLM tool loop takes to fan out MCP calls, resolve any
 * cross-beverage mapping, and hydrate flavor profiles. Without this, a
 * click of "Explore" produced a blank pause (visitor report,
 * 2026-07-05).
 *
 * The empty-input landing (no `?q=` and no `?seed=`) renders fast — no
 * I/O — so this file may flash briefly then get replaced. That's an
 * acceptable trade-off for guaranteed feedback on the slow paths.
 *
 * Layout mirrors the shape of a real result view (heading + attribution
 * strip + three card blocks) so the transition from skeleton to real
 * content doesn't reflow the page. `animate-pulse` on each skeleton
 * block gives a "we're working" cue without a spinner overlay.
 */
export default async function SuggestLoading() {
  const t = await getTranslations('suggest.loading')

  return (
    <main
      className="flex flex-1 w-full max-w-3xl mx-auto flex-col gap-6 py-16 px-8"
      data-testid="suggest-loading"
      aria-busy="true"
      aria-live="polite"
    >
      <h1 className="text-4xl font-semibold leading-tight tracking-tight">
        {t('title')}
      </h1>
      <p className="text-base text-zinc-700 dark:text-zinc-300 max-w-prose">
        {t('body')}
      </p>
      <section
        className="flex w-full flex-col gap-4"
        aria-label={t('title')}
      >
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-64" />
        <ul className="flex flex-col gap-3">
          {[0, 1, 2].map((i) => (
            <li
              key={i}
              className="flex flex-col gap-2 rounded-md border border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
