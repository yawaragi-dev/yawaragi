import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ShellBackLink, shouldShowBackArrow } from './shell-back-link'

// The pathname is the whole input to this component, so the test has to be
// able to vary it — the global `next/navigation` stub in `vitest.setup.ts`
// pins it at '/'. Spread from `importActual` rather than listing exports:
// `@/i18n/navigation` also exports Link, redirect, useRouter and getPathname,
// and a partial factory would turn each of them into `undefined` silently.
let pathname = '/'
vi.mock('@/i18n/navigation', async (importActual) => ({
  ...(await importActual<typeof import('@/i18n/navigation')>()),
  usePathname: () => pathname,
}))

function renderAt(at: string) {
  pathname = at
  return render(
    <NextIntlClientProvider locale="en" messages={{}}>
      <ShellBackLink fallbackHref="/en/home" label="Back" />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => {
  pathname = '/'
})

describe('the back arrow, screen by screen', () => {
  // Rule 11 states the exception, not the rule: "Tab main screens (Home,
  // Scan, Collection, Palate) have no back button. Every other screen has a
  // back arrow top-left." Both halves are asserted, because an implementation
  // that renders nothing anywhere satisfies only the first.
  it.each(['/home', '/scan', '/collection', '/profile'])(
    'is absent on %s, a tab main screen with nowhere to go back to',
    (tab) => {
      renderAt(tab)
      expect(screen.queryByTestId('back-link')).toBeNull()
    },
  )

  it.each([
    '/sake/1234',
    '/sake/1234/similar',
    '/account',
    '/sign-in',
    '/suggest',
  ])('is present on %s, a screen you opened from somewhere', (screenPath) => {
    renderAt(screenPath)
    expect(screen.getByTestId('back-link')).toBeTruthy()
  })

  // §8 draws its own top row — back · the field (screenshot 18) — so the
  // shell's arrow above it was a second back button stacked on the first.
  it('is absent on /search, whose own top row carries the arrow', () => {
    renderAt('/search')
    expect(screen.queryByTestId('back-link')).toBeNull()
  })

  it('falls back to a real destination when there is no history to pop', () => {
    renderAt('/sake/1234')
    expect(screen.getByTestId('back-link').getAttribute('href')).toBe('/en/home')
  })

  it('names itself, since the control is an icon', () => {
    renderAt('/sake/1234')
    expect(screen.getByTestId('back-link').getAttribute('aria-label')).toBe('Back')
  })
})

describe('shouldShowBackArrow', () => {
  it('matches a tab main screen exactly, not by prefix', () => {
    // A screen opened FROM a tab is not that tab. `/collection/cellar` would
    // be one; so is `/sake/[brandId]/similar` under `/sake`. A prefix rule
    // here would strand each of them with no way back.
    expect(shouldShowBackArrow('/collection')).toBe(false)
    expect(shouldShowBackArrow('/collection/cellar')).toBe(true)
    expect(shouldShowBackArrow('/scan/anything')).toBe(true)
  })

  it('does not treat a lookalike path as a tab', () => {
    expect(shouldShowBackArrow('/home-page')).toBe(true)
    expect(shouldShowBackArrow('/profiles')).toBe(true)
  })
})
