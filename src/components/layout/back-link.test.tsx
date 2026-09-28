import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  recordClientNavigation,
  resetClientHistory,
} from '@/lib/navigation/client-history'
import { BackLink } from './back-link'

// `<BackLink />` exists because of rule 11: "the top edge is where am I / go
// back". The design drives it from a history stack, which is Phase 2 — so the
// contract this pins is the narrower one that has to hold either way:
//
//   **it is a real link before it is a history control.**
//
// A visitor who opens /en/imprint from a search result has no history to pop.
// If the control only called `router.back()` it would do nothing at all for
// them, which is the dead-end #162 forbids. So it renders an anchor to a
// stated fallback, and only *upgrades* to popping history when there is
// same-origin history to pop.

function renderBackLink() {
  return render(
    <NextIntlClientProvider locale="en" messages={{}}>
      <BackLink fallbackHref="/" label="Back" />
    </NextIntlClientProvider>,
  )
}

beforeEach(() => {
  // Module state, so it outlives a single render.
  resetClientHistory()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('BackLink', () => {
  it('is a real link to the stated fallback, so a deep-link visitor is never stranded', () => {
    renderBackLink()

    const link = screen.getByTestId('back-link')
    expect(link.tagName).toBe('A')
    expect(link.getAttribute('href')).toBe('/')
    expect(link.getAttribute('aria-label')).toBe('Back')
  })

  it('follows that link on a cold entry, when nothing of ours is behind it', () => {
    renderBackLink()

    // `fireEvent.click` returns false when a handler called preventDefault.
    // Not intercepted means the browser follows the href, which is the only
    // thing that works with no history to pop.
    const notIntercepted = fireEvent.click(screen.getByTestId('back-link'))
    expect(notIntercepted).toBe(true)
  })

  it('pops history once the session has navigated client-side', () => {
    // The reported bug, and why neither ambient signal works: an App Router
    // navigation leaves `document.referrer` untouched, so a visitor who loaded
    // /en/scan and tapped Imprint in the footer looked like a cold deep-link.
    recordClientNavigation()
    renderBackLink()

    const notIntercepted = fireEvent.click(screen.getByTestId('back-link'))
    expect(notIntercepted).toBe(false)
  })
})
