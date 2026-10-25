import { describe, expect, it } from 'vitest'
import { shortBuild } from './app-version'

describe('shortBuild', () => {
  it('names a deployment by the first seven characters of its commit', () => {
    expect(shortBuild('b3af89d0e2c1f4a5b6c7d8e9f0a1b2c3d4e5f6a7')).toBe('b3af89d')
  })

  it('calls a local run without a commit "dev"', () => {
    expect(shortBuild(undefined)).toBe('dev')
  })
})
