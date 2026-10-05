import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { ScanForm } from '@/components/scan/scan-form'
import { isDebugEnabledFromCookies } from '@/lib/debug/debug-mode'
// `DebugPanelMount` lives at the layout level (renders persistently
// across navigations). This page only sources the boolean prop the
// form uses to gate its per-step pushes into the app-level store.
import { hasLocale } from 'next-intl'
import { routing } from '@/i18n/routing'
import { notFound } from 'next/navigation'
import { resolveViewerJournal } from '@/lib/taste/viewer-journal'

/**
 * Scan entry route — `/[locale]/scan`.
 *
 * ADR-0015 (supersedes PRD #105 §"Age-gate interaction"): the route is
 * fully age-gated. The result renders IN PLACE on `/scan` (not
 * `/sake/[brandId]` any more), so a modal overlay would be too weak a
 * seam — the JMStV "no flavor data pre-acceptance" invariant is
 * enforced by the proxy allowing only accepted visitors through to this
 * page. No `<AgeGate />` overlay is rendered here; if the visitor
 * reaches this component, the cookie is set.
 *
 * RSC by default: this page is async server, the only `'use client'`
 * descendant is `<ScanForm />` (which legitimately needs state +
 * onChange + useActionState — see its file-level comment).
 */

interface PageProps {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) return {}
  const t = await getTranslations({ locale, namespace: 'scan.entry' })
  return {
    title: `${t('title')} | Yawaragi`,
    description: t('intro'),
  }
}

export default async function ScanEntryPage({ params }: PageProps) {
  const { locale } = await params

  if (!hasLocale(routing.locales, locale)) {
    notFound()
  }

  setRequestLocale(locale)

  // No launch-state branch here. `/scan` is a GATED path
  // (`UNGATED_LOCALE_PATHS` lists only `/`, the legal documents,
  // `/under-18` and `/sign-in`), so for a non-launched locale the proxy
  // rewrites `/de/scan` to `/de` before this component is reached and
  // `(site)/page.tsx` serves ADR-0008's coming-soon — now with the
  // header, the back arrow and the legal footer. This page used to carry
  // its own copy of that screen, under a comment claiming the route was
  // ungated; it was unreachable, and because both used
  // `data-testid="coming-soon"` the e2e that covers `/de/scan` was
  // passing against the other one.
  const cookieJar = await cookies()
  // Server-rendered: the debug cookie is HttpOnly, so the form can't
  // read it from client JS. We pass the boolean down as a prop and the
  // form skips the panel + per-step accumulation when it's false.
  const debugMode = isDebugEnabledFromCookies(cookieJar)
  // ADR-0020: only a visitor who can keep a journal gets §5's log panel.
  const { canLog } = await resolveViewerJournal(cookieJar)

  // §4 gives the Scan tab a viewfinder, so the screen has no heading and no
  // intro paragraph of its own: the camera carries its own one-line title
  // ("Scan a label") in its top row, and a second heading above it would push
  // the frame down and say the same thing twice. `scan.entry.title` and
  // `.intro` are still the route's metadata — that is where a sentence
  // describing the screen belongs.
  //
  // No `max-w-3xl mx-auto` either: §4 is edge-to-edge. The wide-viewport pass
  // is #322 and deliberately out of scope here (v1.4 is mobile-only on
  // purpose), so this is full-bleed at every width rather than a centred
  // column with a camera in it.
  return (
    <main className="flex w-full flex-col" data-testid="scan-entry-page">
      <ScanForm locale={locale} debugMode={debugMode} canLog={canLog} />
    </main>
  )
}
