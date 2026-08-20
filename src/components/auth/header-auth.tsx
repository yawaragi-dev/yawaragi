'use client'

import { SignOutButton } from '@clerk/nextjs'

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
 */
export function HeaderAuth({ signOutLabel }: { signOutLabel: string }) {
  return (
    <SignOutButton>
      <button
        type="button"
        className="rounded-md px-2 py-1 text-sm text-zinc-600 hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100 dark:focus-visible:outline-zinc-100"
        data-testid="header-sign-out"
      >
        {signOutLabel}
      </button>
    </SignOutButton>
  )
}
