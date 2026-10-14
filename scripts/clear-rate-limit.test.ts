import { describe, expect, it } from 'vitest'
import { keyPattern, parseResetArgs, summariseKeys } from '~/scripts/clear-rate-limit'

describe('pnpm rate-limit:reset (#119)', () => {
  it('says whose budgets it would reset, per bucket, counting a visitor once for their cookie and IP keys', () => {
    expect(
      summariseKeys([
        'rl:vision-scan:cookie:aaa',
        'rl:vision-scan:ip:h1',
        'rl:vision-scan:cookie:bbb',
        'rl:vision-scan:ip:h2',
        'rl:suggestions:cookie:aaa',
      ]),
    ).toEqual([
      { bucket: 'suggestions', keys: 1, visitors: 1 },
      { bucket: 'vision-scan', keys: 4, visitors: 2 },
    ])
  })

  it('asks before deleting unless told --yes, and can be held to one bucket', () => {
    expect(parseResetArgs([])).toEqual({ bucket: null, yes: false })
    expect(parseResetArgs(['--bucket', 'vision-scan', '--yes'])).toEqual({ bucket: 'vision-scan', yes: true })
    expect(keyPattern(null)).toBe('rl:*')
    expect(keyPattern('vision-scan')).toBe('rl:vision-scan:*')
  })

  it('refuses an argument it does not know rather than wiping everything', () => {
    expect(() => parseResetArgs(['--mine'])).toThrow(/Unknown argument/)
    expect(() => parseResetArgs(['--bucket'])).toThrow(/bucket name/)
    expect(() => parseResetArgs(['--bucket', 'rl:*'])).toThrow(/bucket name/)
  })
})
