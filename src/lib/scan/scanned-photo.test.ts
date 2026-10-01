import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  forgetScannedPhoto,
  getScannedPhotoUrl,
  rememberScannedPhoto,
  subscribeScannedPhoto,
} from './scanned-photo'

const photo = () => new Blob(['label'], { type: 'image/jpeg' })

describe('scanned photo, held for the bottle page', () => {
  afterEach(() => forgetScannedPhoto())

  it('has nothing to show before the visitor scans', () => {
    expect(getScannedPhotoUrl()).toBeNull()
  })

  it('hands the bottle page the photo the visitor just scanned', () => {
    rememberScannedPhoto(photo())
    expect(getScannedPhotoUrl()).toMatch(/^blob:/)
  })

  it('releases the previous photo when the visitor scans another bottle', () => {
    const revoke = vi.spyOn(URL, 'revokeObjectURL')
    rememberScannedPhoto(photo())
    const first = getScannedPhotoUrl()
    rememberScannedPhoto(photo())
    expect(revoke).toHaveBeenCalledWith(first)
    expect(getScannedPhotoUrl()).not.toBe(first)
    revoke.mockRestore()
  })

  it('tells a mounted bottle slot when the photo changes', () => {
    const listener = vi.fn()
    const unsubscribe = subscribeScannedPhoto(listener)
    rememberScannedPhoto(photo())
    expect(listener).toHaveBeenCalledTimes(1)
    unsubscribe()
    rememberScannedPhoto(photo())
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
