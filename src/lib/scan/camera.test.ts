import { describe, expect, it } from 'vitest'
import {
  CAMERA_CONSTRAINTS,
  canUseLiveCamera,
  classifyCameraError,
  stopStream,
  supportsTorch,
} from './camera'

describe('which panel a camera failure lands on', () => {
  // The two §4 panels lead with different actions — "Camera is off" with
  // *Allow camera*, "No camera here" with a drop zone — so the wrong one
  // tells the visitor to do something that cannot work for them.
  it.each(['NotAllowedError', 'PermissionDeniedError', 'SecurityError'])(
    'sends %s to the panel that offers to ask again',
    (name) => {
      expect(classifyCameraError(Object.assign(new Error('x'), { name }))).toBe('denied')
    },
  )

  it.each([
    'NotFoundError',
    'DevicesNotFoundError',
    'NotReadableError',
    'TrackStartError',
    'OverconstrainedError',
    'AbortError',
  ])('sends %s to the panel that offers a photo instead', (name) => {
    expect(classifyCameraError(Object.assign(new Error('x'), { name }))).toBe('unavailable')
  })

  it('treats a failure it has never seen as "no camera", not "ask again"', () => {
    // The safer default: that panel's drop zone and file picker work whatever
    // the reason was. Re-prompting for a permission that was never the problem
    // just fails again, in front of the visitor.
    expect(classifyCameraError(new Error('something new'))).toBe('unavailable')
    expect(classifyCameraError(undefined)).toBe('unavailable')
    expect(classifyCameraError('a string')).toBe('unavailable')
  })
})

describe('asking for the back camera', () => {
  it('prefers the rear lens without insisting on one', () => {
    // `exact` here would raise OverconstrainedError on any laptop, sending a
    // visitor with a working webcam to the "No camera here" panel.
    const video = CAMERA_CONSTRAINTS.video as MediaTrackConstraints
    expect(video.facingMode).toEqual({ ideal: 'environment' })
    expect(JSON.stringify(video)).not.toContain('exact')
  })
})

describe('the torch control', () => {
  it('is hidden when the track cannot light anything (every iOS webview)', () => {
    expect(supportsTorch(null)).toBe(false)
    expect(supportsTorch({ getCapabilities: () => ({}) } as unknown as MediaStreamTrack)).toBe(
      false,
    )
    // `getCapabilities` absent entirely — also a no, not a crash.
    expect(supportsTorch({} as unknown as MediaStreamTrack)).toBe(false)
  })

  it('is offered only when the device says it has one', () => {
    expect(
      supportsTorch({ getCapabilities: () => ({ torch: true }) } as unknown as MediaStreamTrack),
    ).toBe(true)
  })
})

describe('deciding before asking', () => {
  it('reports no live camera when the browser has no mediaDevices at all', () => {
    // Answerable without a permission prompt, which is the point: a browser
    // that cannot stream must render the fallback panel rather than raise a
    // dialog to discover it.
    expect(canUseLiveCamera(undefined, true)).toBe(false)
    expect(canUseLiveCamera({} as MediaDevices, true)).toBe(false)
  })

  it('reports a live camera on a phone whose browser can stream', () => {
    expect(
      canUseLiveCamera({ getUserMedia: () => {} } as unknown as MediaDevices, true),
    ).toBe(true)
  })

  it('does not open the camera on a desktop, even one with a webcam', () => {
    // Holding a bottle up to a laptop's front camera is not a way anyone
    // scans a label, and the permission prompt is a cost with no payoff. A
    // desktop goes straight to screenshot 08's "add a photo" panel.
    expect(
      canUseLiveCamera({ getUserMedia: () => {} } as unknown as MediaDevices, false),
    ).toBe(false)
  })
})

describe('letting go of the camera', () => {
  it('stops every track, so the device light goes out', () => {
    const stopped: string[] = []
    const stream = {
      getTracks: () => [
        { stop: () => stopped.push('a') },
        { stop: () => stopped.push('b') },
      ],
    } as unknown as MediaStream

    stopStream(stream)

    expect(stopped).toEqual(['a', 'b'])
  })

  it('does nothing when there is no stream to stop', () => {
    expect(() => stopStream(null)).not.toThrow()
  })
})
