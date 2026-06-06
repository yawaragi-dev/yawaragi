import { describe, expect, it, vi } from 'vitest'
import {
  computeDownscaledSize,
  downscaleImage,
  JPEG_QUALITY,
  MAX_EDGE_PX,
  type DecodedBitmap,
  type DrawContext,
} from './downscale'

describe('computeDownscaledSize', () => {
  // Pure helper — exercise the dimension cases the slice issue calls out
  // explicitly: portrait, landscape, square, large. The "already-small"
  // case (no upscaling) is the inverse property.

  it('scales a landscape image so the longer (width) edge equals maxEdge', () => {
    expect(computeDownscaledSize({ width: 4000, height: 3000 })).toEqual({
      width: 1024,
      height: 768,
    })
  })

  it('scales a portrait image so the longer (height) edge equals maxEdge', () => {
    expect(computeDownscaledSize({ width: 3000, height: 4000 })).toEqual({
      width: 768,
      height: 1024,
    })
  })

  it('scales a square image so both edges equal maxEdge', () => {
    expect(computeDownscaledSize({ width: 2048, height: 2048 })).toEqual({
      width: 1024,
      height: 1024,
    })
  })

  it('does not upscale an already-small image', () => {
    expect(computeDownscaledSize({ width: 500, height: 300 })).toEqual({
      width: 500,
      height: 300,
    })
  })

  it('does not upscale an image whose longer edge equals maxEdge exactly', () => {
    expect(computeDownscaledSize({ width: 1024, height: 768 })).toEqual({
      width: 1024,
      height: 768,
    })
  })

  it('handles a very large image whose longer edge dwarfs maxEdge', () => {
    expect(computeDownscaledSize({ width: 8000, height: 6000 })).toEqual({
      width: 1024,
      height: 768,
    })
  })

  it('preserves aspect ratio when scaling (within rounding)', () => {
    // Property: width/height ratio of the output is within one rounding
    // step of the input ratio, no matter how lopsided the source is.
    const source = { width: 6543, height: 2987 }
    const scaled = computeDownscaledSize(source)
    const inputRatio = source.width / source.height
    const outputRatio = scaled.width / scaled.height
    expect(Math.abs(inputRatio - outputRatio)).toBeLessThan(0.01)
  })

  it('honors a custom maxEdge', () => {
    expect(computeDownscaledSize({ width: 4000, height: 3000 }, 512)).toEqual({
      width: 512,
      height: 384,
    })
  })

  it('throws on a non-positive dimension', () => {
    expect(() => computeDownscaledSize({ width: 0, height: 100 })).toThrow()
    expect(() => computeDownscaledSize({ width: 100, height: -1 })).toThrow()
  })
})

describe('downscaleImage', () => {
  // The DOM-touching pipeline is wired through dependency-injection. We
  // verify the orchestration: it routes the bitmap dimensions through
  // computeDownscaledSize, sizes the canvas correctly, draws into it,
  // and calls toJpegBlob with the requested quality.

  function makeBitmap(width: number, height: number): DecodedBitmap & { closed: boolean } {
    const bitmap = {
      width,
      height,
      closed: false,
      close() {
        this.closed = true
      },
    }
    return bitmap
  }

  function makeContext(jpegBlob: Blob) {
    const drawCalls: Array<{ bitmap: DecodedBitmap; width: number; height: number }> = []
    const toJpegCalls: number[] = []
    const ctx: DrawContext = {
      drawImage(bitmap, width, height) {
        drawCalls.push({ bitmap, width, height })
      },
      toJpegBlob(quality) {
        toJpegCalls.push(quality)
        return Promise.resolve(jpegBlob)
      },
    }
    return { ctx, drawCalls, toJpegCalls }
  }

  it('decodes, sizes the canvas to the downscaled rectangle, draws, and returns the JPEG', async () => {
    const sourceBlob = new Blob(['fake-input'], { type: 'image/jpeg' })
    const outputBlob = new Blob(['fake-output'], { type: 'image/jpeg' })
    const bitmap = makeBitmap(4000, 3000)
    const { ctx, drawCalls, toJpegCalls } = makeContext(outputBlob)
    const createContext = vi.fn(() => ctx)

    const result = await downscaleImage(sourceBlob, {
      decode: async () => bitmap,
      createContext,
    })

    expect(createContext).toHaveBeenCalledWith({ width: 1024, height: 768 })
    expect(drawCalls).toEqual([{ bitmap, width: 1024, height: 768 }])
    expect(toJpegCalls).toEqual([JPEG_QUALITY])
    expect(result).toBe(outputBlob)
  })

  it('uses the configured quality when overridden', async () => {
    const sourceBlob = new Blob([], { type: 'image/jpeg' })
    const bitmap = makeBitmap(800, 600)
    const { ctx, toJpegCalls } = makeContext(new Blob([], { type: 'image/jpeg' }))

    await downscaleImage(sourceBlob, {
      decode: async () => bitmap,
      createContext: () => ctx,
      quality: 0.5,
    })

    expect(toJpegCalls).toEqual([0.5])
  })

  it('uses the configured maxEdge when overridden', async () => {
    const sourceBlob = new Blob([], { type: 'image/jpeg' })
    const bitmap = makeBitmap(4000, 2000)
    let captured: { width: number; height: number } | null = null
    const { ctx } = makeContext(new Blob([], { type: 'image/jpeg' }))

    await downscaleImage(sourceBlob, {
      decode: async () => bitmap,
      createContext: (size) => {
        captured = size
        return ctx
      },
      maxEdge: 512,
    })

    expect(captured).toEqual({ width: 512, height: 256 })
  })

  it('honors EXIF orientation through the decoder seam (portrait bitmap)', async () => {
    // The production decoder calls createImageBitmap with
    // imageOrientation: 'from-image' — a portrait shot taken with EXIF
    // orientation=6 (rotate 90deg CW on display) decodes into a bitmap
    // whose `width` and `height` are already in the upright frame. We
    // simulate this by handing the function a bitmap whose dimensions
    // are the orientation-corrected ones and verifying the downstream
    // pipeline uses them directly (i.e. the function does NOT apply any
    // further rotation that would swap the axes back).
    const sourceBlob = new Blob(['orientation=6'], { type: 'image/jpeg' })
    // Original encoded pixels: 3000x4000 stored as landscape with
    // orientation=6 → upright dimensions are 3000 wide x 4000 tall (a
    // portrait). createImageBitmap with imageOrientation: 'from-image'
    // returns these dimensions directly; our decoder fake mirrors that.
    const uprightBitmap = makeBitmap(3000, 4000)
    let canvasSize: { width: number; height: number } | null = null
    const { ctx, drawCalls } = makeContext(new Blob([], { type: 'image/jpeg' }))

    await downscaleImage(sourceBlob, {
      decode: async () => uprightBitmap,
      createContext: (size) => {
        canvasSize = size
        return ctx
      },
    })

    // Canvas is portrait (taller than wide), confirming the upright
    // bitmap dimensions flowed through and the function didn't rotate
    // them back to the encoded landscape orientation.
    expect(canvasSize).toEqual({ width: 768, height: 1024 })
    expect(drawCalls[0]).toMatchObject({ width: 768, height: 1024 })
  })

  it('closes the decoded bitmap after use (frees backing pixel buffer)', async () => {
    const bitmap = makeBitmap(800, 600)
    const { ctx } = makeContext(new Blob([], { type: 'image/jpeg' }))

    await downscaleImage(new Blob([], { type: 'image/jpeg' }), {
      decode: async () => bitmap,
      createContext: () => ctx,
    })

    expect(bitmap.closed).toBe(true)
  })

  it('closes the decoded bitmap even when toJpegBlob throws', async () => {
    // Defensive: a real encoder can throw (out-of-memory, codec bug). We
    // must still release the bitmap's pixel buffer.
    const bitmap = makeBitmap(800, 600)
    const ctx: DrawContext = {
      drawImage: () => {},
      toJpegBlob: () => Promise.reject(new Error('encoder failure')),
    }

    await expect(
      downscaleImage(new Blob([], { type: 'image/jpeg' }), {
        decode: async () => bitmap,
        createContext: () => ctx,
      }),
    ).rejects.toThrow(/encoder failure/)

    expect(bitmap.closed).toBe(true)
  })
})

describe('downscale constants', () => {
  // Pinned for the integration / e2e layers — if MAX_EDGE_PX or JPEG_QUALITY
  // ever change, the upload size budget changes too, so this is worth a
  // tripwire test.
  it('MAX_EDGE_PX is 1024 (PRD #105 §"Architectural envelope")', () => {
    expect(MAX_EDGE_PX).toBe(1024)
  })

  it('JPEG_QUALITY is 0.85 (PRD #105 §"Architectural envelope")', () => {
    expect(JPEG_QUALITY).toBe(0.85)
  })
})
