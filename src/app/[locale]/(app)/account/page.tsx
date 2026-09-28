import { Globe, SignOut } from '@phosphor-icons/react/dist/ssr'
import { Show } from '@clerk/nextjs'
import { hasLocale } from 'next-intl'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { HeaderAuth } from '@/components/auth/header-auth'
import { CookieSettingsRow } from '@/components/account/cookie-settings-row'
import { SettingsGroup, SettingsRow } from '@/components/account/settings-row'
import { getPathname, Link } from '@/i18n/navigation'
import { isLaunched } from '@/i18n/launch-state'
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
 * `<LegalFooter />`. `legal-footer.tsx` says the app copy goes "when §15
 * lands", and this is §15 landing — but Impressumspflicht (§5 TMG / §18 MStV)
 * wants the Impressum "unmittelbar erreichbar", and trading a link in the pane
 * for two taps is a legal judgement, not a port decision. Both paths exist
 * until someone with standing to decide says otherwise. Tracked on #300.
 *
 * The **Language row is inert**, per §15 ("not tappable until DACH launch"),
 * and the header keeps its locale switch: ADR-0007 requires one in the header,
 * and §15's row cannot replace it while it is not a control. Retiring the
 * header switch needs ADR-0007 amended, which is not this PR's call.
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

  // ADR-0008: the German surface is not launched, so a deep link gets the same
  // coming-soon block every other gated route does.
  if (!isLaunched(locale)) {
    const tComingSoon = await getTranslations({ locale, namespace: 'comingSoon' })
    return (
      <div
        className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-8 py-16"
        data-testid="coming-soon"
      >
        <h1 className="text-headline font-medium text-ink">{tComingSoon('title')}</h1>
        <p className="max-w-prose text-body text-ash-600">{tComingSoon('body')}</p>
        <Link
          href="/"
          locale="en"
          className="text-body font-medium underline underline-offset-4"
        >
          {tComingSoon('switchToEn')}
        </Link>
      </div>
    )
  }

  const t = await getTranslations('account')
  const tFooter = await getTranslations('footer')
  const tSignIn = await getTranslations('signIn')

  const imprintHref = getPathname({ locale, href: '/imprint' })
  const privacyHref = getPathname({ locale, href: '/privacy' })

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

      {/* §15's footer. "Terms" is specified and does not exist yet — there is
          no /terms route and no copy for one, and linking a stub would be
          worse than the honest gap. Tracked on #300. */}
      <footer
        className="flex flex-wrap items-center gap-4 px-1 pt-2"
        data-testid="account-footer"
      >
        <a
          href={imprintHref}
          className="text-meta text-ash-600 underline underline-offset-4 hover:text-ash-800"
          data-testid="account-imprint-link"
        >
          {tFooter('imprintLink')}
        </a>
        <a
          href={privacyHref}
          className="text-meta text-ash-600 underline underline-offset-4 hover:text-ash-800"
          data-testid="account-privacy-footer-link"
        >
          {tFooter('privacyLink')}
        </a>
        <span className="text-meta text-ash-600">{t('footerDrinkResponsibly')}</span>
      </footer>
    </main>
  )
}
