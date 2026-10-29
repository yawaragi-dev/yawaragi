import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LabelScanExtraction } from '@/lib/schemas/label-scan-extraction'
import { EARLIER_READ_TTL_MS } from './earlier-read'
import type { ListActionState } from './list-action-state'
import type { ScanActionState } from './scan-action-state'
import { useScanSession } from './use-scan-session'

const extraction: LabelScanExtraction = {
  name_ja: '人気一',
  brewery_ja: '人気酒造',
  other_names: [],
  confidence: 0.7,
  source: 'llm_extracted',
}
const noMatch: ScanActionState = { status: 'no_match', extraction, candidates: [] }

/** A scan whose answers the test hands out one by one. */
function scanServer() {
  const calls: {
    formData: FormData
    signal: AbortSignal
    answer: (s: ScanActionState) => void
    fail: (e: unknown) => void
  }[] = []
  const scan = vi.fn(
    (formData: FormData, signal: AbortSignal) =>
      new Promise<ScanActionState>((answer, fail) => calls.push({ formData, signal, answer, fail })),
  )
  return { scan, calls }
}

const readList = vi.fn(async (): Promise<ListActionState> => ({ status: 'failed' }))
const photo = () => new File(['jpeg'], 'label.jpg', { type: 'image/jpeg' })

function setOnline(value: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value)
  window.dispatchEvent(new Event(value ? 'online' : 'offline'))
}

function mount(scan: ReturnType<typeof scanServer>['scan']) {
  return renderHook(() => useScanSession({ locale: 'en', scan, readList }))
}

/** Lets the action's awaits and React's transition settle. */
const settle = () => act(async () => {
  await vi.advanceTimersByTimeAsync(0)
})

beforeEach(() => {
  readList.mockClear()
  vi.useFakeTimers()
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:${Math.random()}`)
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useScanSession', () => {
  it('says "Taking longer than usual" 10 s into a read, and Cancel offers to send the photo again', async () => {
    const server = scanServer()
    const { result } = mount(server.scan)
    act(() => {
      result.current.photoTaken(photo())
      result.current.sendPhoto(new Blob(['small']))
    })
    await settle()
    expect(result.current.isPending).toBe(true)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9_999)
    })
    expect(result.current.cameraStatus).toBeNull()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1)
    })
    expect(result.current.cameraStatus).toEqual({ kind: 'slow' })

    act(() => result.current.cancel())
    await settle()
    expect(result.current.cameraStatus).toEqual({ kind: 'timed_out' })
  })

  it('ignores an answer that arrives after Cancel, keeping the photo to send again', async () => {
    const server = scanServer()
    const { result } = mount(server.scan)
    act(() => {
      result.current.photoTaken(photo())
      result.current.sendPhoto(new Blob(['small']))
    })
    await settle()
    act(() => result.current.cancel())
    await settle()

    await act(async () => server.calls[0]!.answer(noMatch))
    await settle()
    expect(result.current.state.status).toBe('idle')
    expect(result.current.cameraStatus).toEqual({ kind: 'timed_out' })
  })

  it('ends the request on Cancel, and sends again at once while the first is still out', async () => {
    const server = scanServer()
    const { result } = mount(server.scan)
    act(() => {
      result.current.photoTaken(photo())
      result.current.sendPhoto(new Blob(['small']))
    })
    await settle()
    act(() => result.current.cancel())
    await settle()
    expect(server.calls[0]!.signal.aborted).toBe(true)
    expect(result.current.isPending).toBe(false)

    act(() => result.current.sendAgain())
    await settle()
    expect(server.scan).toHaveBeenCalledTimes(2)
    await act(async () => server.calls[1]!.answer(noMatch))
    await settle()
    expect(result.current.state.status).toBe('no_match')
    expect(result.current.cameraStatus).toBeNull()
  })

  it('ends the request it gave up on after 30 s', async () => {
    const server = scanServer()
    const { result } = mount(server.scan)
    act(() => result.current.sendPhoto(new Blob(['small'])))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(server.calls[0]!.signal.aborted).toBe(true)
  })

  it('gives up on a read after 30 s', async () => {
    const server = scanServer()
    const { result } = mount(server.scan)
    act(() => result.current.sendPhoto(new Blob(['small'])))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(result.current.cameraStatus).toEqual({ kind: 'timed_out' })
  })

  it('keeps a photo sent with no connection, says so again, and offers "Send now" once the connection is back', async () => {
    setOnline(false)
    const server = scanServer()
    const { result } = mount(server.scan)
    act(() => {
      result.current.photoTaken(photo())
      result.current.sendPhoto(new Blob(['small']))
    })
    await act(async () => server.calls[0]!.fail(new TypeError('Failed to fetch')))
    await settle()
    expect(result.current.cameraStatus).toEqual({ kind: 'offline', back: false, still: false })
    expect(result.current.session.photoUrl).not.toBeNull()

    act(() => result.current.sendAgain())
    await act(async () => server.calls[1]!.fail(new TypeError('Failed to fetch')))
    await settle()
    expect(result.current.cameraStatus).toEqual({ kind: 'offline', back: false, still: true })

    act(() => setOnline(true))
    expect(result.current.cameraStatus).toEqual({ kind: 'offline', back: true, still: false })

    act(() => result.current.sendAgain())
    expect(server.calls[2]!.formData).toBe(server.calls[0]!.formData)
    await act(async () => server.calls[2]!.answer(noMatch))
    await settle()
    expect(result.current.cameraStatus).toBeNull()
    expect(result.current.view).toBe(noMatch)
  })

  it('sends the next photo with the read on screen, until five minutes have passed', async () => {
    const server = scanServer()
    const { result } = mount(server.scan)
    act(() => result.current.sendPhoto(new Blob(['first'])))
    await act(async () => server.calls[0]!.answer(noMatch))
    await settle()

    act(() => result.current.sendPhoto(new Blob(['second'])))
    expect(JSON.parse(String(server.calls[1]!.formData.get('earlierRead')))).toMatchObject({ name_ja: '人気一' })
    await act(async () => server.calls[1]!.answer(noMatch))
    await settle()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(EARLIER_READ_TTL_MS)
    })
    expect(result.current.earlierRead).toBeNull()
    act(() => result.current.sendPhoto(new Blob(['third'])))
    expect(server.calls[2]!.formData.get('earlierRead')).toBeNull()
    // React finishes every pending action together; leave none behind.
    await act(async () => server.calls[2]!.answer(noMatch))
  })

  it('lets go of the photo when the visitor goes back to the camera', async () => {
    const { result } = mount(scanServer().scan)
    act(() => result.current.photoTaken(photo()))
    const url = result.current.session.photoUrl
    act(() => result.current.dispatch({ type: 'backToCamera' }))
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url)
  })

  it('reads a menu once, and opening it again shows the same read without paying twice', async () => {
    readList.mockResolvedValueOnce({ status: 'read', result: {} as never })
    const server = scanServer()
    const { result } = mount(server.scan)
    act(() => result.current.sendPhoto(new Blob(['menu'])))
    await act(async () => server.calls[0]!.answer(noMatch))
    await settle()

    act(() => result.current.rank('menu'))
    await settle()
    expect(result.current.session.listOpen).toBe('menu')
    act(() => result.current.dispatch({ type: 'listClosed' }))
    act(() => result.current.rank('menu'))
    await settle()
    expect(readList).toHaveBeenCalledTimes(1)
    expect(result.current.session.listOpen).toBe('menu')
  })
})
