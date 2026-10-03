'use client'

import { SignIn } from '@clerk/nextjs'

/**
 * The Clerk sign-in widget (#244 follow-on — the maintainer journal is gated
 * on `auth().userId`, and until this landed nothing could populate it).
 *
 * LOGIN ONLY. Per ADR-0020 v1 is a maintainer-only private beta: there is no
 * `/sign-up` route, no `signUpUrl` here, and the widget's footer action (its
 * "Don't have an account? Sign up" link) is hidden. The allowlist in
 * `maintainer.ts` is what actually enforces access — this only avoids
 * advertising a door that isn't there.
 *
 * Copy comes from `messages/{en,de}.json` via the `localization` prop on
 * `<ClerkProvider>` in the locale layout (Clerk applies localisation at the
 * provider, not per widget). See `clerk-localization.ts` for why we map it
 * ourselves instead of adding `@clerk/localizations`.
 *
 * `routing="hash"` keeps the whole flow on `/[locale]/sign-in` with hash
 * fragments instead of sub-paths. That matters here: `routing.ts#pathnames`
 * is a strict manifest and the age gate keeps its own path list, so a
 * catch-all `[[...sign-in]]` route would need every Clerk sub-path mirrored
 * in both. One route, one entry in each list.
 */
export function SignInCard({ fallbackRedirectUrl }: { fallbackRedirectUrl: string }) {
  return (
    <SignIn
      routing="hash"
      // Where a signed-in visitor lands when the URL carries no
      // `redirect_url` (Clerk honours one when present, and checks it against
      // the instance's allowed origins). Without this Clerk sends them to "/",
      // which the locale routing turns into Home — so signing in from Account
      // dropped the visitor on a different tab. Most visible with Google: the
      // round trip through Google's pages leaves nothing to go "back" to.
      fallbackRedirectUrl={fallbackRedirectUrl}
      appearance={{
        elements: {
          // No public sign-up (ADR-0020) — hide the footer that links to it.
          footerAction: { display: 'none' },
        },
      }}
    />
  )
}
