'use client'

import { useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { Link, useRouter } from '@/i18n/navigation'
import { LocaleSwitcher } from '@/components/layout/locale-switcher'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { acceptAgeGate } from '@/lib/legal/age-gate-actions'

/**
 * The 18+ gate — design v1.4 §1, reference screenshot 01.
 *
 * Ported from a centred confirmation dialog to the design's full-screen,
 * bottom-aligned screen. It stays a `<Dialog>` underneath even though the
 * design draws a screen rather than a dialog, and that is deliberate: the
 * gate is genuinely modal — ADR-0006 requires that nothing behind it is
 * usable — and base-ui's Dialog is what supplies the focus trap, the escape
 * of focus back afterwards, and the labelled-title contract. Reimplementing
 * that as a `fixed inset-0` div would be rebuilding a11y we already have.
 *
 * **No tab bar**, per §1. The dialog's overlay and opaque full-screen panel
 * cover the shell, so the rule holds without the shell knowing about the gate.
 *
 * Not ported, on purpose: the **"Not there?" region picker**. §1 offers chips
 * for Germany · Austria · Switzerland · Japan · US · UK · South Korea, and
 * Open decision 1 in the design handoff still marks those figures "commonly
 * cited, not legally checked" with detection unresolved. CLAUDE.md's rule for
 * open decisions is a TODO and a placeholder, and here even a placeholder is
 * wrong: a chip that states a drinking age is a legal claim. Germany's line is
 * the EU default and the only one the handoff treats as settled. See #293.
 */
export function AgeGate() {
  const t = useTranslations('ageGate')
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onAccept() {
    const returnTo = window.location.pathname + window.location.search
    startTransition(async () => {
      await acceptAgeGate(returnTo)
    })
  }

  function onDecline() {
    router.push('/under-18')
  }

  return (
    <>
      {/*
        An opaque cover, rendered on the SERVER, so nothing behind the gate is
        ever on screen. The dialog itself lives in a portal, and portals mount
        only after hydration: until then the server HTML was the landing page
        with no gate over it, and a fresh visitor saw it, sample flavor chart
        included, before the gate appeared (maintainer report). CLAUDE.md:
        no flavor data before the 18+ gate is accepted.

        Under the dialog (z-50 backdrop, z-60 content), over the page and the
        cookie banner (z-40). Same ground as the gate, so the hand-over at
        hydration is invisible.
      */}
      <div
        aria-hidden="true"
        className="fixed inset-0 z-[45] bg-ground"
        data-testid="age-gate-cover"
      />
    <Dialog open modal onOpenChange={() => {}} disablePointerDismissal>
      <DialogContent
        showCloseButton={false}
        // Overrides the centred-card geometry: §1 is a full screen with a
        // 32/26/40 padding box and everything stacked against the bottom edge.
        // The large gap is what puts the identity block where screenshot 01
        // has it while keeping the stack bottom-anchored on a taller screen.
        className="top-0 left-0 flex h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col justify-end gap-52 rounded-none border-0 bg-ground px-[26px] pt-8 pb-10 sm:max-w-none"
        data-testid="age-gate"
      >
        <div className="flex flex-col gap-4">
          {/* Not a translatable string — the kanji is the product's name and
              stays verbatim in every locale. */}
          <p className="text-hero font-medium text-ginshu-700" lang="ja">
            和らぎ
          </p>
          <DialogTitle className="max-w-[12ch] text-hero font-medium text-balance text-ink">
            {t('hero')}
          </DialogTitle>
          <DialogDescription className="text-body text-ash-600">
            {t('lead')}
          </DialogDescription>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-meta text-ash-600" data-testid="age-gate-law-line">
            {t('lawLine')}
          </p>

          {/* 50px primary, 42px secondary, per §1. Neither is accent-filled:
              the design reserves the accent for marks, stars and selection,
              and "the accent never floods a surface". */}
          <button
            type="button"
            onClick={onAccept}
            disabled={isPending}
            data-testid="age-gate-accept"
            className="h-[50px] rounded-lg bg-ash-200 text-card-heading font-medium text-ink transition-colors hover:bg-ash-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600 disabled:opacity-60"
          >
            {t('accept')}
          </button>
          <button
            type="button"
            onClick={onDecline}
            disabled={isPending}
            data-testid="age-gate-decline"
            className="h-[42px] rounded-lg bg-ash-100 text-body text-ash-800 transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600 disabled:opacity-60"
          >
            {t('decline')}
          </button>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <LocaleSwitcher />
            {/* §1 lists Impressum · Privacy notice · Terms. There is no Terms
                page, and #162's rule is that an advertised destination is a
                real one — so it is absent rather than dead. */}
            <nav className="flex items-center gap-4 text-meta text-ash-600">
              <Link
                href="/imprint"
                className="rounded-sm underline underline-offset-4 hover:text-ash-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
                data-testid="age-gate-imprint-link"
              >
                {t('imprintLink')}
              </Link>
              <Link
                href="/privacy"
                className="rounded-sm underline underline-offset-4 hover:text-ash-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
                data-testid="age-gate-privacy-link"
              >
                {t('privacyLink')}
              </Link>
            </nav>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  )
}
