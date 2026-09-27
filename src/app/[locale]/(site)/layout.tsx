import { Header } from '@/components/layout/header'
import { LegalFooter } from '@/components/layout/legal-footer'

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
 * §0 replaces this header and footer with the landing's own (wordmark + 和らぎ,
 * locale switch, "Open the app"; a five-link footer with the Sakenowa credit).
 * That is the landing MR's job — this is the shared chrome until then.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Header />
      {children}
      <LegalFooter />
    </>
  )
}
