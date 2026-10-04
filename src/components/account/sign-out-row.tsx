'use client'

import { useState } from 'react'
import { useClerk } from '@clerk/nextjs'
import { SignOut } from '@phosphor-icons/react/dist/ssr'
import { beginAuthTransition, endAuthTransition } from '@/lib/auth/auth-transition'
import { cn } from '@/lib/utils'

function hardReload(path: string): void {
  window.location.replace(path)
}

/**
 * §15's sign-out row: the whole 50px row is the button, like "Cookie
 * settings" above it.
 *
 * It used to be a settings row with a separate small ghost "Sign out" button
 * at its end: the label twice, and only the little one tappable (maintainer
 * review on #343).
 *
 * `redirectUrl` is the page the visitor is on, so signing out keeps them where
 * they were instead of Clerk's default "/", which the locale routing turns
 * into Home. The sign-out then ends in one full reload of that page, behind
 * `<RefreshOnAuthChange />`'s wall from the tap onwards.
 *
 * Deliberately NOT Clerk's `<SignOutButton>` or `<UserButton />`: the first
 * hands its child no pending state, so the row sat dead between tap and
 * redirect; the second renders Clerk's English-only chrome on `/de`. Driving
 * `useClerk().signOut` directly lets the row acknowledge the tap in the same
 * frame (`disabled` + `aria-busy` + a localised pending label), per the UX
 * playbook's 100 ms rule.
 */
export function SignOutRow({
  label,
  pendingLabel,
  reload = hardReload,
}: {
  label: string
  pendingLabel: string
  /** How the sign-out finishes. A full page load in the app; a spy in tests. */
  reload?: (path: string) => void
}) {
  const { signOut } = useClerk()
  const [isSigningOut, setIsSigningOut] = useState(false)

  return (
    <button
      type="button"
      disabled={isSigningOut}
      aria-busy={isSigningOut}
      onClick={() => {
        // No `finally` reset: a successful sign-out navigates, so the pending
        // state should hold until the page changes rather than flicker back.
        setIsSigningOut(true)
        // One wall, start to finish: up before Clerk forgets the user, down
        // only when the fresh, signed-out page loads. See `auth-transition.ts`
        // for the double flash this replaces.
        const path = window.location.pathname
        beginAuthTransition()
        void signOut({ redirectUrl: path })
          .then(() => reload(path))
          .catch(() => {
            // Still signed in: take the wall down and let them try again.
            endAuthTransition()
            setIsSigningOut(false)
          })
      }}
      className={cn(
        'flex w-full min-h-[50px] items-center gap-3.5 px-4 py-2.5 text-left transition-colors',
        'border-b border-divider last:border-b-0 cursor-pointer',
        'hover:bg-ash-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ginshu-600',
        'disabled:cursor-default disabled:opacity-60',
      )}
      data-testid="account-sign-out"
    >
      <SignOut size={20} className="shrink-0 text-ash-600" aria-hidden="true" />
      <span className="text-body text-ink">{isSigningOut ? pendingLabel : label}</span>
    </button>
  )
}
