import { afterEach, describe, expect, it, vi } from 'vitest'
import { timeStep } from './time-step'

describe('timeStep', () => {
  afterEach(() => vi.restoreAllMocks())

  it('logs a slow step by name and time, and nothing about who asked', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const value = await timeStep('palate/pool', () => new Promise((resolve) => setTimeout(() => resolve(42), 30)), 10)
    expect(value).toBe(42)
    expect(warn).toHaveBeenCalledTimes(1)
    const [tag, line] = warn.mock.calls[0] as [string, string]
    expect(tag).toBe('[yawaragi:slow]')
    expect(Object.keys(JSON.parse(line))).toEqual(['where', 'ms'])
  })

  it('stays quiet for a fast step', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await timeStep('palate/pool', async () => 1, 1000)
    expect(warn).not.toHaveBeenCalled()
  })
})
