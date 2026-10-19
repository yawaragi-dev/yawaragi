// @vitest-environment node
import { NextRequest } from 'next/server'
import { describe, expect, it } from 'vitest'
import { leaveSampleOnScan } from './leave-sample-on-scan'

function request(path: string, sample: boolean) {
  return new NextRequest(new URL(path, 'https://yawaragi.example'), {
    headers: sample ? { cookie: 'yawaragi_sample=1' } : {},
  })
}

describe('leaveSampleOnScan', () => {
  it('leaves the sample when the visitor opens the camera, and keeps them on it', () => {
    const response = leaveSampleOnScan(request('/en/scan', true))
    expect(response?.status).toBe(303)
    expect(response?.headers.get('location')).toBe('https://yawaragi.example/en/scan')
    expect(response?.cookies.get('yawaragi_sample')?.value).toBe('')
  })

  it('leaves the sample alone everywhere else, and does nothing when it is off', () => {
    expect(leaveSampleOnScan(request('/en/collection', true))).toBeNull()
    expect(leaveSampleOnScan(request('/en/scan', false))).toBeNull()
  })
})
