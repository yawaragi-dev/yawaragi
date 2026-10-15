import { act, render } from '@testing-library/react'
import { StrictMode } from 'react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import en from '~/messages/en.json'
import { CameraCapture } from './camera-capture'

function fakeStream() {
  const track = { stop: vi.fn(), getCapabilities: () => ({}) }
  return { track, stream: { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream }
}

function renderCamera({ strict = false } = {}) {
  const camera = (
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <CameraCapture isWorking={false} onCapture={() => {}} onChoosePhoto={() => {}} typeItHref={null} stillUrl={null} />
    </NextIntlClientProvider>
  )
  return render(strict ? <StrictMode>{camera}</StrictMode> : camera)
}

describe('the live camera', () => {
  let pending: ((stream: MediaStream) => void)[]
  const resolveStream = (stream: MediaStream) => pending.shift()!(stream)

  beforeEach(() => {
    // A phone: a touchscreen as the primary pointer, and a camera to ask for.
    pending = []
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(pointer: coarse)', media: query }))
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: () => new Promise<MediaStream>((resolve) => pending.push(resolve)) },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
  })

  it('turns the camera off when it opens after the screen has gone', async () => {
    // A photo picked before the camera finished opening, or React mounting
    // the screen twice in development: the stream arrives with nobody to
    // stop it, and the camera light stayed on.
    const { track, stream } = fakeStream()
    const { unmount } = renderCamera()
    unmount()

    await act(async () => resolveStream(stream))

    expect(track.stop).toHaveBeenCalled()
  })

  it('keeps one camera open when the screen is mounted twice, and turns it off when the screen goes', async () => {
    // React's development double mount opens the camera twice; the first
    // stream belongs to a mount that is already gone.
    const first = fakeStream()
    const second = fakeStream()
    const { unmount } = renderCamera({ strict: true })
    expect(pending).toHaveLength(2)

    await act(async () => resolveStream(first.stream))
    await act(async () => resolveStream(second.stream))

    expect(first.track.stop).toHaveBeenCalled()
    expect(second.track.stop).not.toHaveBeenCalled()
    unmount()
    expect(second.track.stop).toHaveBeenCalled()
  })

  it('turns the camera off when the screen goes', async () => {
    const { track, stream } = fakeStream()
    const { unmount } = renderCamera()
    await act(async () => resolveStream(stream))
    expect(track.stop).not.toHaveBeenCalled()

    unmount()

    expect(track.stop).toHaveBeenCalled()
  })
})
