import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '~/messages/en.json'
import AppError from './error'

const fetchMock = vi.fn(async () => new Response(null, { status: 204 }))

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  window.history.replaceState(null, '', '/en/sake/123?rate=1')
})
afterEach(() => {
  vi.unstubAllGlobals()
  fetchMock.mockClear()
})

function show(error: Error & { digest?: string }) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <AppError error={error} unstable_retry={() => {}} />
    </NextIntlClientProvider>,
  )
}

describe('the error screen', () => {
  it('reports a crash that happened in the browser, with its message and path only', () => {
    show(new TypeError("Cannot read properties of undefined (reading 'entryId')"))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/api/client-error')
    expect(JSON.parse(String(init.body))).toEqual({
      message: "Cannot read properties of undefined (reading 'entryId')",
      path: '/en/sake/123',
    })
    expect(init.credentials).toBe('omit')
  })

  it('does not report a server error again — the server logged it with its digest', () => {
    show(Object.assign(new Error('An error occurred in the Server Components render.'), { digest: '4088566476' }))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('says there is no connection, not that the catalogue is out of reach, when the phone is offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    show(Object.assign(new Error('fetch failed'), { digest: '1' }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('No connection')
    expect(screen.getByText('This page needs the internet. Anything you saved before is safe.')).toBeTruthy()
    expect(screen.getByTestId('app-error-retry')).toBeTruthy()
    expect(screen.getByTestId('app-error-home')).toBeTruthy()
    vi.restoreAllMocks()
  })
})
