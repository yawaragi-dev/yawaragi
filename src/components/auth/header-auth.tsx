'use client'

import { useState } from 'react'
import { useClerk } from '@clerk/nextjs'
import { Button } from '@/components/ui/button'

/**
 * The sign-out control (#244 follow-on). Mounted on §15 Account inside
 * Clerk's `<Show when="signed-in">`. It used to sit in the header too; it was
 * taken out on #343 because the 390px header had no room for it beside the
 * locale pair and the avatar, and Account is one tap away. (The name is
 * historical.)
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
