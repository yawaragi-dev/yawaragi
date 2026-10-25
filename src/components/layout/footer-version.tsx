'use client'

import { usePathname } from '@/i18n/navigation'

/**
 * "Yawaragi {version} · build {sha}" at the start of Account's footer line
 * (design v1.10, AA6), so someone reporting a problem can say which build
 * they saw. Account only: the footer lives in the app shell, which does not
 * know which screen it is under — the same reason `<FooterCredit />` reads
 * the pathname. The text itself is worked out on the server and passed in.
 */
export function FooterVersion({ text }: { text: string }) {
  const pathname = usePathname()
  if (pathname !== '/account') return null
  return (
    <span className="whitespace-nowrap py-1.5 tabular-nums" data-testid="footer-version">
      {text}
    </span>
  )
}
