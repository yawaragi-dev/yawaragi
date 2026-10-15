import { describe, expect, it } from 'vitest'
import { GET } from './route'

const call = (query: string) => GET(new Request(`https://yawaragi.dev/api/sample-collection${query}`))

describe('/api/sample-collection', () => {
  it('opens the sample collection on the Collection tab, in the visitor’s language', async () => {
    const res = await call('?locale=en')
    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('https://yawaragi.dev/en/collection')
    expect(res.headers.get('set-cookie')).toMatch(/^yawaragi_sample=1;/)
  })

  it('a session cookie, unreadable from scripts', async () => {
    const cookie = (await call('?locale=en')).headers.get('set-cookie') ?? ''
    expect(cookie).toMatch(/HttpOnly/i)
    expect(cookie).not.toMatch(/Max-Age|Expires/i)
  })

  it('leaving clears it and goes Home', async () => {
    const res = await call('?locale=en&leave=1')
    expect(res.headers.get('location')).toBe('https://yawaragi.dev/en/home')
    expect(res.headers.get('set-cookie')).toMatch(/^yawaragi_sample=;.*Max-Age=0/i)
  })

  it('falls back to English for a locale it does not know', async () => {
    const res = await call('?locale=xx')
    expect(res.headers.get('location')).toBe('https://yawaragi.dev/en/collection')
  })
})
