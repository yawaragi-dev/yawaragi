import { describe, expect, it, vi, beforeEach } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

const clerk = { loaded: true, openSignIn: vi.fn() }
vi.mock('@clerk/nextjs', () => ({ useClerk: () => clerk }))

import { SignInInPlace } from './sign-in-in-place'

function renderLink() {
  render(
    <SignInInPlace href="/en/sign-in?redirect_url=%2Fen%2Fscan" data-testid="link">
      Sign in to rank these
    </SignInInPlace>,
  )
  return screen.getByTestId('link')
}

describe('SignInInPlace', () => {
  beforeEach(() => {
    clerk.loaded = true
    clerk.openSignIn.mockReset()
  })

  it('opens sign-in over the page and stays on it, Google in a popup', () => {
    const link = renderLink()
    const click = new MouseEvent('click', { bubbles: true, cancelable: true })
    fireEvent(link, click)

    expect(click.defaultPrevented).toBe(true)
    expect(clerk.openSignIn).toHaveBeenCalledWith(
      expect.objectContaining({ oauthFlow: 'popup', forceRedirectUrl: window.location.href }),
    )
  })

  it('goes to the sign-in page while Clerk has not loaded', () => {
    clerk.loaded = false
    const link = renderLink()
    expect(link.getAttribute('href')).toBe('/en/sign-in?redirect_url=%2Fen%2Fscan')
    fireEvent.click(link)

    // The link navigates as a link does; no sign-in is opened over the page.
    expect(clerk.openSignIn).not.toHaveBeenCalled()
  })
})
