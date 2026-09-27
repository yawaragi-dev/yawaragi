import { getTranslations } from 'next-intl/server'
import { Header } from '@/components/layout/header'
import { LegalFooter } from '@/components/layout/legal-footer'
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
 * Why 100dvh and not 100vh: on mobile Safari `vh` is the *largest* viewport,
 * so the tab bar would sit behind the browser's own chrome until the user
 * scrolls. `dvh` tracks the visible area.
 */
export default async function AppShellLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const t = await getTranslations('tabs')

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
      {/* The header is INSIDE the locked column, not above it: a sibling in
          the parent layout would add its height to `100dvh` and the page
          itself would scroll — the one thing rule 10 forbids. */}
      <Header />
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {children}
        {/* Inside the scrolling pane, so the Impressum stays reachable from
            every app screen without a second fixed bar. See <LegalFooter />. */}
        <LegalFooter />
      </main>
      <TabBar messages={messages} />
    </div>
  )
}
