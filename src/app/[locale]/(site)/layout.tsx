import { cookies } from 'next/headers'
import { CookieBanner } from '@/components/legal/cookie-banner'
import { getComplianceState } from '@/lib/legal/compliance-state'

/**
 * Everything outside the app shell: the landing page, the legal documents and
 * the age-gate rejection screen.
 *
 * These pages **scroll normally**. The design is explicit that the landing is
 * "a separate, normally scrolling page outside the app shell", and a privacy
 * notice locked to `100dvh` with an inner scroller would be a worse document
 * than the one we have. So rule 10's phone lock lives in `(app)` only, and
 * this group keeps ordinary document flow.
 *
 * The group holds only the consent banner now. The landing brings §0's own
 * header and footer; the legal documents keep the plain app chrome through the
 * nested `(chrome)` group. The banner is common to both, and its `site`
 * placement is §0's geometry — centred above the bottom edge, since there is
 * no tab bar here to clear.
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  // Only the GDPR `consent` field: the banner is GDPR, the age gate is
  // JMStV, and the two regimes stay distinct (ADR-0006, ADR-0009).
  const { consent } = getComplianceState(await cookies())

  return (
    <>
      {children}
      <CookieBanner initialDecision={consent} placement="site" />
    </>
  )
}
