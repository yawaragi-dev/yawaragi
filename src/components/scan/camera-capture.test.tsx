import { act, render } from '@testing-library/react'
import { StrictMode } from 'react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import en from '~/messages/en.json'
import { CameraCapture } from './camera-capture'

function fakeStream() {
  const track = { stop: vi.fn(), getCapabilities: () => ({}) }
  return { track, stream: { getTracks: () => [track], getVideoTracks: () => [track] } as unknown as MediaStream }
}

function renderCamera({
  strict = false,
  askedFor = null,
}: { strict?: boolean; askedFor?: { title: string; hint: string } | null } = {}) {
  const camera = (
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <CameraCapture
        isWorking={false}
        onCapture={() => {}}
        onChoosePhoto={() => {}}
        typeItHref={null}
        stillUrl={null}
        askedFor={askedFor}
      />
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

  it('asks for one label, and for the part a nudge asked for when it opened the camera', async () => {
    // happy-dom's <video> refuses a stand-in stream; a phone's takes it.
    const srcObject = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'srcObject')
    Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', { configurable: true, get: () => null, set: () => {} })
    onTestFinished(() => {
      if (srcObject) Object.defineProperty(HTMLMediaElement.prototype, 'srcObject', srcObject)
    })

    const plain = renderCamera()
    await act(async () => resolveStream(fakeStream().stream))
    expect(plain.getByTestId('scan-camera-hint').textContent).toContain('Fill the frame with one label')
    expect(plain.getByTestId('scan-camera-read-a-label')).toBeTruthy()
    plain.unmount()

    const asked = renderCamera({
      askedFor: { title: 'Frame the small label with numbers', hint: 'Usually on the back: small print, a % sign and a date.' },
    })
    await act(async () => resolveStream(fakeStream().stream))
    const hint = asked.getByTestId('scan-camera-hint')
    expect(hint.textContent).toContain('Frame the small label with numbers')
    expect(asked.getByTestId('scan-camera-asked-hint').textContent).toContain('a % sign and a date')
    expect(asked.queryByTestId('scan-camera-read-a-label')).toBeNull()
  })
})
