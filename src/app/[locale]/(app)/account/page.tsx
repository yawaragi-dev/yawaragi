import { Globe, SignOut } from '@phosphor-icons/react/dist/ssr'
import { Show } from '@clerk/nextjs'
import { hasLocale } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { HeaderAuth } from '@/components/auth/header-auth'
import { CookieSettingsRow } from '@/components/account/cookie-settings-row'
import { SettingsGroup, SettingsRow } from '@/components/account/settings-row'
import { Link } from '@/i18n/navigation'
import { routing } from '@/i18n/routing'

/**
 * §15 Account — the first slice.
 *
 * §15 is large: backup, journal export (CSV · JSON), sake-name display,
 * temperature units, region & drinking age, the Ask toggle, the
 * contribute-to-flavour-charts consent, and delete-account with a cascade.
 * Most of those are **features, not styling** — export and erasure are GDPR
 * surfaces with their own RoPA consequences, "Contribute to flavour charts" is
 * a new lawful basis, and region is blocked on #293's legal review of the
 * drinking-age figures. Shipping them as rows that do nothing would be worse
 * than not shipping them.
 *
 * So this slice builds the screen and the rows that are **real today**:
 * identity, Language (inert, exactly as §15 specifies), Cookie settings, sign
 * out, and the legal footer. What it buys immediately is §15's own
 * navigational promise — "From any tab: avatar → Impressum is 2 taps" — and a
 * home for the withdrawal path that ADR-0009 wants as easy as giving.
 *
 * **What it deliberately does not do yet:** remove the app-side
 * `<LegalFooter />` from the *other* screens. `legal-footer.tsx` says the app
 * copy goes "when §15 lands", and this is §15 landing — but Impressumspflicht
 * (§5 TMG / §18 MStV) wants the Impressum "unmittelbar erreichbar", and
 * trading a link in the pane for two taps is a legal judgement, not a port
 * decision. Both paths exist until someone with standing to decide says
 * otherwise. Tracked on #300.
 *
 * On THIS screen there is no footer of its own: `<LegalFooter />` renders
 * inside the same pane and IS §15's footer. It carries the
 * responsible-drinking line too — an earlier draft kept that line here, which
 * produced two footers, one left-aligned and one right, with a gap between.
 * "Terms" is specified and has no route or copy yet; linking a stub would be
 * worse than the honest gap. Tracked on #300.
 *
 * The **Language row is inert**, per §15 ("not tappable until DACH launch"),
 * and the header keeps its locale switch alongside it. That duplication is
 * deliberate and its end condition is written down: ADR-0007's 2026-09-30
 * amendment makes this row the switcher's canonical home, and the header
 * control interim until `de` joins `LAUNCHED_LOCALES` — at which point this
 * row becomes a real switch and the header's goes, in the same PR. Removing
 * the header switch while this row is inert would leave the app with no way
 * to change locale, which is the requirement ADR-0007 protects.
 */
interface PageProps {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) return {}
  const t = await getTranslations({ locale, namespace: 'account' })
  return { title: `${t('title')} | Yawaragi` }
}

export default async function AccountPage({ params }: PageProps) {
  const { locale } = await params
  if (!hasLocale(routing.locales, locale)) notFound()
  setRequestLocale(locale)

  // No launch-state branch. `/account` is absent from `UNGATED_LOCALE_PATHS`,
  // which is deny-by-default, so for a non-launched locale the proxy rewrites
  // `/de/account` to `/de` and `(site)/page.tsx` serves ADR-0008's
  // coming-soon before this component runs. #309 removed the same unreachable
  // copy from `/scan`; this one would have been its twin.
  const t = await getTranslations('account')
  const tSignIn = await getTranslations('signIn')

  return (
    <main
      className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-5 py-6"
      data-testid="account-page"
    >
      <h1 className="text-title font-medium text-ink">{t('title')}</h1>

      {/* §15's identity block. Signed out is the common case by design —
          ADR-0020 keeps sign-up shut to everyone but maintainers, and the
          product works with no account at all, which is what the copy says
          rather than nagging. */}
      <Show when="signed-out">
        <section
          className="flex flex-col gap-2 rounded-xl bg-surface p-4 shadow-yw-sm"
          data-testid="account-not-signed-in"
        >
          <h2 className="text-card-heading font-medium text-ink">{t('notSignedInTitle')}</h2>
          <p className="text-body text-ash-600">{t('notSignedInBody')}</p>
          <Link
            href="/sign-in"
            className="w-fit rounded-sm text-body font-medium text-ginshu-700 underline underline-offset-4 hover:text-ginshu-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
            data-testid="account-sign-in-link"
          >
            {t('signInCta')}
          </Link>
        </section>
      </Show>

      <SettingsGroup title={t('groupDisplay')} testId="account-group-display">
        {/* Inert on purpose: §15 marks Language "not tappable until DACH
            launch", and ADR-0008 gates the German app anyway — a switch here
            would lead to the coming-soon page, which is not a language. */}
        <SettingsRow
          icon={Globe}
          label={t('languageLabel')}
          value={t('languageValue')}
          sub={t('languageSub')}
          testId="account-language"
        />
      </SettingsGroup>

      <SettingsGroup title={t('groupPrivacy')} testId="account-group-privacy">
        <CookieSettingsRow
          label={t('cookieSettingsLabel')}
          sub={t('cookieSettingsSub')}
        />
      </SettingsGroup>

      <Show when="signed-in">
        <SettingsGroup title={t('groupAccount')} testId="account-group-account">
          <SettingsRow icon={SignOut} label={tSignIn('signOut')} testId="account-sign-out">
            <HeaderAuth
              signOutLabel={tSignIn('signOut')}
              signingOutLabel={tSignIn('signingOut')}
            />
          </SettingsRow>
        </SettingsGroup>
      </Show>

    </main>
  )
}
