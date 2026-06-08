'use client'

/**
 * Client-side image downscale for the label-scan flow.
 *
 * PRD #105 §"Architectural envelope" + ADR-0012: the wrap target is a
 * Capacitor `WKWebView` against the hosted backend, so the downscale runs
 * client-side via the standard `createImageBitmap` + `<canvas>.toBlob`
 * path — no `sharp`, no server image dependency.
 *
 * The module splits into a pure dimension/orientation helper (unit-tested
 * directly) and a thin DOM-touching wrapper (covered end-to-end by
 * Playwright). happy-dom does not implement `createImageBitmap`,
 * `OffscreenCanvas`, or full canvas drawing, so the DOM wrapper accepts
 * a `BitmapDecoder` dependency that tests can swap in. Production reads
 * EXIF orientation via `createImageBitmap(blob, { imageOrientation:
 * 'from-image' })` — a standard since 2022, supported in every webview
 * Yawaragi targets — so we don't need to parse EXIF bytes ourselves.
 */

export const MAX_EDGE_PX = 1024
export const JPEG_QUALITY = 0.85

/**
 * Pure: given a source's dimensions, return the {width, height} the
 * canvas should be sized to so that the longer edge equals `maxEdge` and
 * the aspect ratio is preserved. If both edges are already at or below
 * `maxEdge`, return the source size unchanged (no upscaling).
 *
 * Decoupling this from canvas lets the property tests (portrait,
 * landscape, square, already-small, very large) live in vitest without a
 * canvas backend.
 */
export function computeDownscaledSize(
  source: { width: number; height: number },
  maxEdge: number = MAX_EDGE_PX,
): { width: number; height: number } {
  if (source.width <= 0 || source.height <= 0) {
    throw new Error(`computeDownscaledSize: invalid source ${source.width}x${source.height}`)
  }
  const longer = Math.max(source.width, source.height)
  if (longer <= maxEdge) return { width: source.width, height: source.height }
  const scale = maxEdge / longer
  // Round to integers; canvas dimensions must be integers and the
  // browser will silently floor floats anyway. `Math.round` keeps the
  // aspect ratio closest to the original.
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  }
}

/**
 * Minimal subset of `ImageBitmap` the downscale needs. Allows tests to
 * pass a hand-built rectangle without depending on a real bitmap.
 */
export interface DecodedBitmap {
  width: number
  height: number
  // ImageBitmap.close() exists in browsers; tests can no-op it.
  close?(): void
}

/**
 * Decodes a Blob into a bitmap whose pixels are in their EXIF-corrected
 * orientation. In production this delegates to `createImageBitmap` with
 * `imageOrientation: 'from-image'`. The seam exists so tests can inject a
 * fake decoder without a real browser image pipeline.
 */
export type BitmapDecoder = (blob: Blob) => Promise<DecodedBitmap>

/**
 * Drawing primitive — copies a decoded bitmap onto a 2D canvas context
 * scaled into the target rectangle. Same seam: production uses the real
 * canvas; tests substitute a recording fake.
 */
export interface DrawContext {
  drawImage(bitmap: DecodedBitmap, width: number, height: number): void
  toJpegBlob(quality: number): Promise<Blob>
}

export type DrawContextFactory = (
  size: { width: number; height: number },
) => DrawContext

export interface DownscaleDeps {
  decode: BitmapDecoder
  createContext: DrawContextFactory
  maxEdge?: number
  quality?: number
}

/**
 * Decodes the input, computes the downscaled size, draws into a 2D
 * canvas, and returns a JPEG Blob.
 *
 * EXIF orientation: `createImageBitmap(blob, { imageOrientation:
 * 'from-image' })` returns a bitmap whose `width`/`height` already
 * reflect the in-image orientation tag, so a portrait phone shot saved
 * with orientation=6 comes back as `{width: shorter, height: longer}`
 * with pixels rotated upright. The rest of the function treats the
 * bitmap as a plain rectangle — no manual transform needed.
 */
export async function downscaleImage(blob: Blob, deps: DownscaleDeps): Promise<Blob> {
  const bitmap = await deps.decode(blob)
  try {
    const target = computeDownscaledSize(
      { width: bitmap.width, height: bitmap.height },
      deps.maxEdge ?? MAX_EDGE_PX,
    )
    const ctx = deps.createContext(target)
    ctx.drawImage(bitmap, target.width, target.height)
    return await ctx.toJpegBlob(deps.quality ?? JPEG_QUALITY)
  } finally {
    bitmap.close?.()
  }
}

/**
 * Production decoder. Uses the standard `createImageBitmap` with
 * `imageOrientation: 'from-image'` so EXIF orientation is honored
 * automatically. Browsers without this option (none of our targets)
 * would render the orientation-7 portrait sideways.
 *
 * Throws if `createImageBitmap` is missing — that's a webview-target
 * regression that should fail loudly rather than silently no-op.
 */
export const browserBitmapDecoder: BitmapDecoder = async (blob) => {
  if (typeof createImageBitmap !== 'function') {
    throw new Error(
      'createImageBitmap is not available in this environment; required for client-side downscale',
    )
  }
  return createImageBitmap(blob, { imageOrientation: 'from-image' })
}

/**
 * Production canvas factory. Creates a `<canvas>` of the requested size
 * and returns a `DrawContext` wrapping its 2D context + `toBlob`.
 */
export const browserCanvasFactory: DrawContextFactory = (size) => {
  if (typeof document === 'undefined') {
    throw new Error('browserCanvasFactory: no document; required for client-side downscale')
  }
  const canvas = document.createElement('canvas')
  canvas.width = size.width
  canvas.height = size.height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('browserCanvasFactory: 2d context unavailable')
  }
  return {
    drawImage(bitmap, w, h) {
      // We cast through `CanvasImageSource` — both real `ImageBitmap` and
      // any test fake whose duck-type matches will be accepted by the
      // browser's actual drawImage implementation, but TS only knows the
      // structural subset we declared on `DecodedBitmap`.
      ctx.drawImage(bitmap as unknown as CanvasImageSource, 0, 0, w, h)
    },
    toJpegBlob(quality) {
      return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('canvas.toBlob returned null'))
              return
            }
            resolve(blob)
          },
          'image/jpeg',
          quality,
        )
      })
    },
  }
}
