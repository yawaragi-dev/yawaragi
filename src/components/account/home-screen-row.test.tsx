import { describe, expect, it } from 'vitest'
import { guessHomeScreenPlatform } from './home-screen-row'

describe('guessHomeScreenPlatform', () => {
  it('puts the iPhone steps first on an iPhone, and on an iPad that calls itself a Mac', () => {
    expect(guessHomeScreenPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 5)).toBe('ios')
    expect(guessHomeScreenPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe('ios')
  })

  it('puts the Android steps first on Android', () => {
    expect(guessHomeScreenPlatform('Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile', 5)).toBe('android')
  })

  it('makes no guess on a desktop', () => {
    expect(guessHomeScreenPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBeNull()
    expect(guessHomeScreenPlatform('Mozilla/5.0 (X11; Linux x86_64; rv:140.0) Firefox/140.0', 0)).toBeNull()
  })
})
