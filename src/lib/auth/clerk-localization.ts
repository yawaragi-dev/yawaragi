/**
 * Maps our `signIn` message namespace onto the shape Clerk's `localization`
 * prop expects (#244 follow-on).
 *
 * Why this exists rather than `@clerk/localizations`: Clerk ships its own
 * English UI copy, which would put an English-only component on `/de` and
 * trip the "no English-only strings" merge rule. The official localisation
 * package is the eventual answer, but its current release sits inside our
 * 14-day `minimumReleaseAge` quarantine — and lowering that for UI copy is
 * not a trade worth making. Sourcing the visible strings from
 * `messages/{en,de}.json` instead keeps the German in the catalogue a
 * reviewer already reads.
 *
 * Coverage is deliberately partial: the first-screen strings a maintainer
 * actually sees. Deeper flow states (2FA prompts, provider errors) still fall
 * back to Clerk's English until the package can be added.
 *
 * Pure and framework-free so the mapping is unit-testable without mounting
 * Clerk or a request scope.
 */

export interface ClerkSignInStrings {
  cardTitle: string
  cardSubtitle: string
  emailLabel: string
  passwordLabel: string
  submit: string
}

/** The subset of Clerk's localization object we populate. */
export interface ClerkLocalizationOverrides {
  signIn: {
    start: {
      title: string
      subtitle: string
      actionText: string
      actionLink: string
    }
  }
  formFieldLabel__emailAddress: string
  formFieldLabel__password: string
  formButtonPrimary: string
}

export function buildClerkLocalization(
  strings: ClerkSignInStrings,
): ClerkLocalizationOverrides {
  return {
    signIn: {
      start: {
        title: strings.cardTitle,
        subtitle: strings.cardSubtitle,
        // Blanked, not translated: ADR-0020 allows no public sign-up, so the
        // widget must not render a "Don't have an account? Sign up" invitation
        // even if a future Clerk version ignores the appearance rule that
        // hides its footer.
        actionText: '',
        actionLink: '',
      },
    },
    formFieldLabel__emailAddress: strings.emailLabel,
    formFieldLabel__password: strings.passwordLabel,
    formButtonPrimary: strings.submit,
  }
}
