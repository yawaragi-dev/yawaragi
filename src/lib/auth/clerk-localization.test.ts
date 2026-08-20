import { describe, expect, it } from 'vitest'
import enMessages from '~/messages/en.json'
import deMessages from '~/messages/de.json'
import { buildClerkLocalization } from '@/lib/auth/clerk-localization'

const STRINGS = {
  cardTitle: 'Sign in to Yawaragi',
  cardSubtitle: 'Maintainer access',
  emailLabel: 'Email address',
  passwordLabel: 'Password',
  submit: 'Continue',
}

describe('buildClerkLocalization', () => {
  it("replaces Clerk's own copy with the strings we were given", () => {
    const localization = buildClerkLocalization(STRINGS)

    expect(localization.signIn.start.title).toBe('Sign in to Yawaragi')
    expect(localization.formFieldLabel__emailAddress).toBe('Email address')
    expect(localization.formButtonPrimary).toBe('Continue')
  })

  it('blanks the sign-up invitation, because there is no public sign-up', () => {
    // ADR-0020 keeps v1 maintainer-only. The widget must not offer a route to
    // account creation even in copy — blanking the strings is the belt to the
    // appearance rule's braces.
    const localization = buildClerkLocalization(STRINGS)

    expect(localization.signIn.start.actionText).toBe('')
    expect(localization.signIn.start.actionLink).toBe('')
  })

  it('is driven by the message catalogue in both locales, not Clerk defaults', () => {
    // The point of the whole mapping: German visitors must not meet an
    // English-only widget. If the de catalogue ever loses these keys, this
    // fails rather than silently falling back to English.
    const de = buildClerkLocalization(deMessages.signIn)
    const en = buildClerkLocalization(enMessages.signIn)

    expect(de.formButtonPrimary).toBe('Weiter')
    expect(en.formButtonPrimary).toBe('Continue')
    expect(de.signIn.start.title).not.toBe(en.signIn.start.title)
  })
})
