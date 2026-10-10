import { cookies } from 'next/headers'
import { CookieBanner } from '@/components/legal/cookie-banner'
import { getComplianceState } from '@/lib/legal/compliance-state'
import { getTranslations } from 'next-intl/server'
import { LegalFooter } from '@/components/layout/legal-footer'
import { NoticeHost } from '@/components/journal/undo-notice'
import { TabBar, type TabBarMessages } from '@/components/layout/tab-bar'

/**
 * The app shell — design v1.4 § "App structure" and rule 11.
 *
 * Everything reachable through a tab lives in this route group. The landing
 * page, the legal documents and the age-gate rejection sit in `(site)`
 * instead: the design is explicit that the landing is "a separate, normally
 * scrolling page outside the app shell", and the age gate has no tab bar.
 * Route groups keep the URLs unchanged — `(app)` and `(site)` are not
 * segments — so this split costs no links and no redirects.
 *
 * **Rule 10, the phone lock:** `height: 100dvh; overflow: hidden` on the
 * shell, with only the inner pane scrolling. `<main>` is that pane, and
 * `min-h-0` is what makes it work — a flex child's default `min-height: auto`
 * refuses to shrink below its content, so without it the pane grows past the
 * viewport and the *page* scrolls, which is exactly what the rule forbids.
 * `overscroll-contain` stops a scroll that reaches the end of the pane from
 * rubber-banding the page behind it.
 *
 * **`overflow-x-clip` is not redundant with `overflow-y-auto`** — it is the
 * correction for it. CSS computes a `visible` axis to `auto` whenever the
 * other axis is not visible, so `overflow-y: auto` alone silently makes the
 * pane pannable sideways. That matters here more than it would anywhere else:
 * `[locale]/layout.tsx` carries `overflow-x-clip` on <html> and <body> as a
 * deliberate defence against overhanging popovers (the provenance badge's
 * tooltip is `w-max max-w-xs` and runs ~72px past a 390px screen), and moving
 * the scrolling box off the document put the new box INSIDE that defence
 * rather than under it. Pinned by "clips an over-wide child instead of letting
 * the pane pan sideways" in `e2e/app-shell.spec.ts`.
 *
 * Why 100dvh and not 100vh: on mobile Safari `vh` is the *largest* viewport,
 * so the tab bar would sit behind the browser's own chrome until the user
 * scrolls. `dvh` tracks the visible area.
 */
export default async function AppShellLayout({ children }: { children: React.ReactNode }) {
  const t = await getTranslations('tabs')
  const { consent } = getComplianceState(await cookies())

  const messages: TabBarMessages = {
    navLabel: t('navLabel'),
    home: t('home'),
    scan: t('scan'),
    collection: t('collection'),
    palate: t('palate'),
  }

  return (
    <div
      className="flex h-[100dvh] flex-col overflow-hidden overscroll-none"
      data-testid="app-shell"
    >
      {/* No shared header (design v1.5, App structure → Headers): each screen
          owns its top — a tab main screen its title beside the avatar
          (`<TabHeader />`), any other screen "back · title" (`<ScreenBar />`),
          the camera and its outcomes their own rows. */}
      {/* A size container, so a screen can size itself to exactly the pane
          with `cqh` — the space above the tab bar on
          this device, browser toolbars included. §4's camera does. Size
          containment is safe here: the pane's own size comes from the flex
          column, never from its content. */}
      <main
        className="min-h-0 flex-1 overflow-y-auto overflow-x-clip overscroll-contain [container-type:size]"
        data-app-pane=""
      >
        {children}
        {/* Inside the scrolling pane, so the Impressum stays reachable from
            every app screen without a second fixed bar. See <LegalFooter />. */}
        <LegalFooter credit />
        {/* While the cookie banner is open it floats over the bottom of the
            pane (§2: it does not block the app). This spacer, as tall as the
            banner (`--cookie-banner-h`, published by <CookieBanner />, unset
            when it is closed), lets the end of every screen — the Impressum
            included — scroll out from under it. */}
        <div aria-hidden="true" className="h-[var(--cookie-banner-h,0px)]" />
      </main>
      <TabBar messages={messages} />
      {/* Plain notices from components that unmount as they finish —
          "Tasting deleted" — see `announceNotice`. */}
      <NoticeHost />
      {/* Fixed, so it sits outside the scrolling pane and above the tab
          bar — §2 puts it 88px up for exactly that clearance. */}
      <CookieBanner initialDecision={consent} placement="app" />
    </div>
  )
}
