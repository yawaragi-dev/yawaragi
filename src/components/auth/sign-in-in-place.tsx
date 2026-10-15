'use client'

// `'use client'`: opens Clerk's sign-in on a click, in the browser.

import { useClerk } from '@clerk/nextjs'
import NextLink from 'next/link'
import type { ReactNode } from 'react'
import { SIGN_IN_APPEARANCE } from '@/components/auth/sign-in-card'

interface SignInInPlaceProps {
  /** `/[locale]/sign-in` with a `redirect_url` back here: the fallback. */
  href: string
  className?: string
  children: ReactNode
  'data-testid'?: string
}

/**
 * A sign-in prompt that does not leave the page it is on.
 *
 * Sending the visitor to `/sign-in` and back reloads the screen they asked
 * from, and anything held only in the tab's memory goes with it: a scanned
 * menu came back as an empty camera, so the visitor had to shoot it again
 * (#440 review). Clerk's sign-in opens over the page instead, and Google runs
 * in a popup (`oauthFlow: 'popup'`) rather than a redirect, so the page never
 * unloads. When it closes, `<RefreshOnAuthChange />` re-renders the server
 * parts for the signed-in visitor; client state survives `router.refresh()`.
 *
 * Still a real link: until Clerk has loaded, and without JavaScript, it goes
 * to the sign-in page as before, which returns here via `redirect_url`.
 */
export function SignInInPlace({ href, className, children, 'data-testid': testId }: SignInInPlaceProps) {
  const clerk = useClerk()
  return (
    <NextLink
      href={href}
      className={className}
      data-testid={testId}
      onClick={(event) => {
        if (!clerk.loaded) return
        event.preventDefault()
        clerk.openSignIn({
          oauthFlow: 'popup',
          // Clerk navigates here when sign-in completes. The same URL keeps
          // the page mounted; without it Clerk would go to "/" (Home).
          forceRedirectUrl: window.location.href,
          appearance: SIGN_IN_APPEARANCE,
        })
      }}
    >
      {children}
    </NextLink>
  )
}
