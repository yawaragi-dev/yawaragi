import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const signOut = vi.fn(() => new Promise<void>(() => {}))
vi.mock('@clerk/nextjs', () => ({
  useClerk: () => ({ signOut }),
}))

const { SignOutRow } = await import('./sign-out-row')

describe('the Account sign-out row', () => {
  beforeEach(() => {
    signOut.mockClear()
    window.history.replaceState(null, '', '/en/account')
  })

  it('is one button across the whole row, not a small one at its end', () => {
    render(<SignOutRow label="Sign out" pendingLabel="Signing out…" />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0].textContent).toContain('Sign out')
    expect(buttons[0].className).toContain('w-full')
  })

  it('signs out and brings the visitor back to the page they were on', () => {
    render(<SignOutRow label="Sign out" pendingLabel="Signing out…" />)
    fireEvent.click(screen.getByRole('button'))
    expect(signOut).toHaveBeenCalledWith({ redirectUrl: '/en/account' })
  })

  it('acknowledges the tap at once, while the sign-out is in flight', () => {
    render(<SignOutRow label="Sign out" pendingLabel="Signing out…" />)
    fireEvent.click(screen.getByRole('button'))
    const button = screen.getByRole('button')
    expect(button.textContent).toContain('Signing out…')
    expect(button.hasAttribute('disabled')).toBe(true)
  })
})
