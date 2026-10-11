import { Link } from '@/i18n/navigation'

/**
 * §18's public strip offers one way into the product. `/home` is behind the
 * 18+ gate, so a visitor who has not confirmed their age meets the gate
 * first — which is the point of keeping these pages outside it.
 */
export function OpenTheApp({ label }: { label: string }) {
  return (
    <Link
      href="/home"
      className="flex min-h-9 shrink-0 items-center rounded-lg border border-ash-300 px-3 text-meta font-medium text-ink transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
      data-testid="learn-open-app"
    >
      {label}
    </Link>
  )
}
