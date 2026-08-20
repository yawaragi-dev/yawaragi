'use client'

import { useState } from 'react'
import { useClerk } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'

/**
 * The header's sign-out control (#244 follow-on). Mounted by `<Header />`
 * inside Clerk's `<Show when="signed-in">`, so signed-out visitors see
 * nothing — the public product needs no account, and an always-visible
 * "Sign in" link would advertise a door ADR-0020 keeps shut for everyone but
 * maintainers. `/[locale]/sign-in` stays reachable by URL for those who need it.
 *
 * Deliberately NOT Clerk's `<UserButton />`: that renders Clerk's own English
 * chrome ("Manage account", "Sign out"), which would put an English-only
 * component on `/de`. A plain button with a next-intl label keeps the copy in
 * `messages/{en,de}.json` where the German is reviewable.
 *
 * `useClerk().signOut` rather than `<SignOutButton>`: sign-out is a network
 * round-trip, and the wrapper hands its child no pending state, so the button
 * sat dead between click and redirect. Driving it directly lets the control
 * acknowledge the click in the same frame (`disabled` + `aria-busy` + a
 * localised pending label), per the UX playbook's 100 ms rule.
 */
export function HeaderAuth({
  signOutLabel,
  signingOutLabel,
}: {
  signOutLabel: string
  signingOutLabel: string
}) {
  const { signOut } = useClerk()
  const [isSigningOut, setIsSigningOut] = useState(false)

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={isSigningOut}
      aria-busy={isSigningOut}
      data-testid="header-sign-out"
      onClick={() => {
        // No `finally` reset: a successful sign-out navigates away, so the
        // pending state should persist until the page changes rather than
        // flicker back to idle mid-redirect.
        setIsSigningOut(true)
        void signOut().catch(() => setIsSigningOut(false))
      }}
    >
      {isSigningOut ? signingOutLabel : signOutLabel}
    </Button>
  )
}
