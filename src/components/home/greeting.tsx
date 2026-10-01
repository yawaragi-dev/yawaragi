'use client'

import { useTranslations } from 'next-intl'
import { greetingBandFor } from '@/lib/home/greeting'

/**
 * §3's header: 和らぎ, then the greeting at 34px.
 *
 * `'use client'` is load-bearing, and the reason is the one thing a server
 * cannot know: **the visitor's clock.** `new Date()` on the server is the
 * server's timezone — UTC on Vercel — so a server-rendered greeting is wrong
 * for anyone outside it, and wrong by hours for the Japanese market. There is
 * no header or cookie that carries a reliable offset.
 *
 * `suppressHydrationWarning` is therefore deliberate, not a patch over a bug.
 * The server renders *a* greeting (so the heading has its height and the page
 * does not shift), the client renders the right one, and React is told the
 * difference is expected — exactly the case the attribute exists for. The
 * alternative, rendering nothing until hydration, moves everything below the
 * fold by a 34px line on first paint.
 *
 * 和らぎ is data, not copy: it is the product's name in Japanese and is
 * preserved verbatim in every locale.
 */
export function HomeGreeting() {
  const t = useTranslations('home')
  const band = greetingBandFor(new Date().getHours())

  return (
    <div className="flex flex-col gap-0.5" data-testid="home-greeting">
      <p className="text-subtle text-ash-600" lang="ja">
        和らぎ
      </p>
      <h1
        className="text-hero font-medium text-ink"
        suppressHydrationWarning
        data-testid="home-greeting-text"
      >
        {t(`greeting.${band}`)}
      </h1>
    </div>
  )
}
