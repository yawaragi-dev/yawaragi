import { describe, expect, it } from 'vitest'
import {
  RateLimitConfigError,
  assertRateLimitConfig,
  type PartialRateLimitConfig,
} from './config-gate'

const FULL: PartialRateLimitConfig = {
  secret: 'x'.repeat(32),
  salt: 'y'.repeat(16),
  kvUrl: 'https://example.upstash.io',
  kvToken: 'tok_test',
}

describe('assertRateLimitConfig', () => {
  it('returns the config when all four keys are present in production', () => {
    const result = assertRateLimitConfig(FULL, true)
    expect(result).toEqual({
      secret: FULL.secret,
      salt: FULL.salt,
      kvUrl: FULL.kvUrl,
      kvToken: FULL.kvToken,
    })
  })

  it('returns the config when all four keys are present in non-production', () => {
    const result = assertRateLimitConfig(FULL, false)
    expect(result).not.toBeNull()
    expect(result?.secret).toBe(FULL.secret)
  })

  it('throws naming SESSION_COOKIE_SECRET when secret is missing in production', () => {
    expect(() =>
      assertRateLimitConfig({ ...FULL, secret: undefined }, true),
    ).toThrowError(
      expect.objectContaining({
        name: 'RateLimitConfigError',
        missingKeys: ['SESSION_COOKIE_SECRET'],
      }),
    )
  })

  it('throws naming IP_HASH_SALT when salt is missing in production', () => {
    expect(() =>
      assertRateLimitConfig({ ...FULL, salt: undefined }, true),
    ).toThrowError(
      expect.objectContaining({
        name: 'RateLimitConfigError',
        missingKeys: ['IP_HASH_SALT'],
      }),
    )
  })

  it('throws naming UPSTASH_REDIS_REST_URL when kvUrl is missing in production', () => {
    expect(() =>
      assertRateLimitConfig({ ...FULL, kvUrl: undefined }, true),
    ).toThrowError(
      expect.objectContaining({
        name: 'RateLimitConfigError',
        missingKeys: ['UPSTASH_REDIS_REST_URL'],
      }),
    )
  })

  it('throws naming UPSTASH_REDIS_REST_TOKEN when kvToken is missing in production', () => {
    expect(() =>
      assertRateLimitConfig({ ...FULL, kvToken: undefined }, true),
    ).toThrowError(
      expect.objectContaining({
        name: 'RateLimitConfigError',
        missingKeys: ['UPSTASH_REDIS_REST_TOKEN'],
      }),
    )
  })

  it('lists ALL missing keys when more than one is unset in production', () => {
    expect(() =>
      assertRateLimitConfig(
        { secret: undefined, salt: undefined, kvUrl: undefined, kvToken: undefined },
        true,
      ),
    ).toThrowError(
      expect.objectContaining({
        missingKeys: [
          'SESSION_COOKIE_SECRET',
          'IP_HASH_SALT',
          'UPSTASH_REDIS_REST_URL',
          'UPSTASH_REDIS_REST_TOKEN',
        ],
      }),
    )
  })

  it('returns null (not throw) when any key is missing in non-production', () => {
    expect(
      assertRateLimitConfig({ ...FULL, kvToken: undefined }, false),
    ).toBeNull()
    expect(
      assertRateLimitConfig(
        { secret: undefined, salt: undefined, kvUrl: undefined, kvToken: undefined },
        false,
      ),
    ).toBeNull()
  })

  it('treats empty string the same as undefined (defensive against `.env` files)', () => {
    expect(() =>
      assertRateLimitConfig({ ...FULL, secret: '' }, true),
    ).toThrowError(
      expect.objectContaining({ missingKeys: ['SESSION_COOKIE_SECRET'] }),
    )
  })

  it('exposes RateLimitConfigError so callers can match on type', () => {
    try {
      assertRateLimitConfig({ ...FULL, secret: undefined }, true)
      throw new Error('expected to throw')
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitConfigError)
    }
  })
})
