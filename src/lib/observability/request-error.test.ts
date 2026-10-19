import { afterEach, describe, expect, it, vi } from 'vitest'
import { reportRequestError } from '@/lib/observability/request-error'

afterEach(() => vi.restoreAllMocks())

const pgError = Object.assign(
  new Error('(EMAXCONNSESSION) max clients reached in session mode - max clients are limited to pool_size: 15'),
  { code: 'XX000', digest: '4088566476' },
)

describe('a failed request in the runtime log', () => {
  it('names the route, what kind of request it was and what broke', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    reportRequestError(
      pgError,
      { path: '/en/sake/123?rate=1', method: 'GET', headers: { cookie: 'yawaragi_session=secret' } },
      { routerKind: 'App Router', routePath: '/[locale]/sake/[brandId]', routeType: 'render', renderSource: 'react-server-components-payload', revalidateReason: undefined },
    )
    const line = String(error.mock.calls[0]?.[1])
    expect(line).toContain('/[locale]/sake/[brandId]')
    expect(line).toContain('react-server-components-payload')
    expect(line).toContain('EMAXCONNSESSION')
    expect(line).toContain('4088566476')
    expect(line).toContain('XX000')
  })

  it('leaves out the concrete URL and every header, cookies included', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    reportRequestError(
      pgError,
      { path: '/en/bottling/0b5e-own-id', method: 'POST', headers: { cookie: 'yawaragi_session=secret', 'x-forwarded-for': '203.0.113.9' } },
      { routerKind: 'App Router', routePath: '/[locale]/bottling/[id]', routeType: 'action', revalidateReason: undefined },
    )
    const logged = JSON.stringify(error.mock.calls)
    expect(logged).not.toContain('0b5e-own-id')
    expect(logged).not.toContain('secret')
    expect(logged).not.toContain('203.0.113.9')
  })
})
