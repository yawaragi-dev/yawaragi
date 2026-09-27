import { Header } from '@/components/layout/header'
import { LegalFooter } from '@/components/layout/legal-footer'

/**
 * The legal documents and the age-gate rejection screen.
 *
 * Split out of `(site)` once the landing grew its own §0 header and footer:
 * these pages still want the plain app chrome, and the landing must not get
 * both sets. Nested route group, so the URLs are untouched.
 */
export default function SiteChromeLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      {children}
      <LegalFooter />
    </>
  )
}
