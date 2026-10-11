import { BookOpen } from '@phosphor-icons/react/dist/ssr'
import { Link } from '@/i18n/navigation'
import type { GuideSlug } from '@/lib/guide/entries'

/**
 * The last line of an info sheet that has a Learn entry behind it (design v1.6
 * §16: "Learn more in the Sake guide", ghost, book icon). A sheet holds one
 * caveat; the entry holds the rest.
 *
 * It opens in a new tab. These sheets sit over work in progress — a scan
 * result not yet rated, a tasting sheet half filled in — and Learn is a
 * different part of the site (ADR-0026: public, outside the app shell). A
 * plain link would trade the visitor's place for a definition.
 *
 * No directive of its own: it renders inside both server and client sheets.
 */
export function LearnMoreLink({ slug, label }: { slug: GuideSlug; label: string }) {
  return (
    <Link
      href={{ pathname: '/learn/[slug]', params: { slug } }}
      target="_blank"
      rel="noopener"
      className="mt-4 flex min-h-11 w-fit items-center gap-2 text-subtle font-medium text-ginshu-700 hover:text-ginshu-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
      data-testid={`learn-more-${slug}`}
    >
      <BookOpen size={16} aria-hidden="true" />
      {label}
    </Link>
  )
}
