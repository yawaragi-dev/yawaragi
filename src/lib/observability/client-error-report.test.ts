import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleClientErrorReport } from '@/lib/observability/client-error-report'

afterEach(() => vi.restoreAllMocks())

function post(body: unknown, init: RequestInit = {}) {
  return new Request('https://yawaragi.test/api/client-error', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: 'yawaragi_session=secret' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...init,
  })
}

describe('a crash report from the browser', () => {
  it('lands in the runtime log as the route pattern and the message', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await handleClientErrorReport(
      post({ message: "Cannot read properties of undefined (reading 'entryId')", path: '/en/sake/123' }),
    )
    expect(response.status).toBe(204)
    const line = String(error.mock.calls[0]?.[1])
    expect(line).toContain('client render')
    expect(line).toContain("reading 'entryId'")
    expect(line).toContain('/en/sake/:id')
  })

  it('keeps ids, query strings and cookies out of the log', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    await handleClientErrorReport(
      post({ message: 'boom', path: '/en/bottling/6f1c2a90-77aa-4b1e-9d3c-0b5e8f1a2b3c?from=scan' }),
    )
    const logged = JSON.stringify(error.mock.calls)
    expect(logged).toContain('/en/bottling/:id')
    expect(logged).not.toContain('6f1c2a90')
    expect(logged).not.toContain('from=scan')
    expect(logged).not.toContain('secret')
  })

  it('refuses a report that is not one, and logs nothing for it', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await handleClientErrorReport(post('not json'))).status).toBe(400)
    expect((await handleClientErrorReport(post({ path: '/en' }))).status).toBe(400)
    expect((await handleClientErrorReport(post({ message: 'x'.repeat(5000), path: '/en' }))).status).toBe(413)
    expect(error).not.toHaveBeenCalled()
  })
})
