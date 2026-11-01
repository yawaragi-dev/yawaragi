// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/scan/list-action', () => ({
  readListPhoto: vi.fn(async () => ({ status: 'not_allowed' })),
}))

import { readListPhoto } from '@/lib/scan/list-action'
import { POST } from './route'

function listPost(origin?: string) {
  const body = new FormData()
  body.set('image', new Blob(['jpeg'], { type: 'image/jpeg' }), 'list.jpg')
  body.set('kind', 'menu')
  body.set('locale', 'en')
  return new Request('https://yawaragi.dev/en/scan/list', {
    method: 'POST',
    body,
    headers: origin === undefined ? {} : { origin },
  })
}

beforeEach(() => vi.mocked(readListPhoto).mockClear())

describe('POST /{locale}/scan/list', () => {
  it('answers with the list read, its signed-in and rate-limit checks included', async () => {
    const res = await POST(listPost('https://yawaragi.dev'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'not_allowed' })
    const sent = vi.mocked(readListPhoto).mock.calls[0]![0]
    expect(sent.get('kind')).toBe('menu')
  })

  it('refuses a read sent from another site, so no page elsewhere can spend a visitor’s scans', async () => {
    const res = await POST(listPost('https://evil.example'))
    expect(res.status).toBe(403)
    expect(readListPhoto).not.toHaveBeenCalled()
  })
})
