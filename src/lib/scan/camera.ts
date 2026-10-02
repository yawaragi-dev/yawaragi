/**
 * Live-camera plumbing for §4 — the decisions worth testing without a browser.
 *
 * ADR-0012 pins two constraints this module exists to honour:
 *
 *   1. **The file-input path stays.** `getUserMedia` is an enhancement layered
 *      over the OS picker, never a replacement — "a build where the OS picker
 *      is unreachable violates this ADR". So every failure here resolves to a
 *      state that still offers the gallery, and none of them is fatal.
 *   2. **The torch cannot ship on iOS.** `applyConstraints({ torch })` is
 *      absent from WKWebView, which is the wrap's renderer. The design's answer
 *      is to hide the control and keep its 44px grid slot so the title does not
 *      shift — which is a capability question, answered by `supportsTorch`.
 */

/**
 * Back camera, framed for a bottle label.
 *
 * `facingMode: 'environment'` is `ideal`, not `exact`: a laptop has only a
 * user-facing camera, and `exact` would turn that into an
 * `OverconstrainedError` — i.e. it would send a visitor with a working webcam
 * to the "No camera here" panel. The resolution is likewise ideal; the frame is
 * 212×292 CSS px and the vision call gets a downscaled JPEG anyway, so there is
 * nothing to gain from insisting.
 */
export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: { ideal: 'environment' },
    width: { ideal: 1280 },
    height: { ideal: 1280 },
  },
  audio: false,
}

/**
 * Which §4 panel a `getUserMedia` rejection lands on.
 *
 * The two panels say different things and offer different first actions —
 * "Camera is off" leads with *Allow camera* (07), "No camera here" leads with a
 * drop zone (08) — so routing a rejection to the wrong one tells the visitor to
 * do something that cannot work. A laptop with no webcam being told to grant
 * permission is the failure this function exists to prevent.
 *
 * Unknown names resolve to `unavailable`, which is the safer default: its panel
 * offers the file picker and the drop zone, both of which work regardless of
 * why the camera did not open. `denied` would offer an "Allow camera" button
 * that re-prompts and fails again.
 */
export type CameraFailure = 'denied' | 'unavailable'

export function classifyCameraError(error: unknown): CameraFailure {
  const name =
    typeof error === 'object' && error !== null && 'name' in error
      ? String((error as { name: unknown }).name)
      : ''

  switch (name) {
    // The visitor said no, or the browser refused on their behalf (an
    // insecure origin raises SecurityError on some engines). Both are
    // re-askable, which is what the "Camera is off" panel offers.
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'denied'
    // No device, a device another app holds, or constraints no device can
    // meet. Asking for permission again changes none of them.
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'NotReadableError':
    case 'TrackStartError':
    case 'OverconstrainedError':
    case 'AbortError':
      return 'unavailable'
    default:
      return 'unavailable'
  }
}

/** Whether this track can turn a light on. False on iOS, by platform. */
export function supportsTorch(track: MediaStreamTrack | null | undefined): boolean {
  if (!track) return false
  // `getCapabilities` is itself absent on some engines, which is a "no".
  const capabilities = track.getCapabilities?.() as { torch?: boolean } | undefined
  return capabilities?.torch === true
}

/**
 * Whether to open a live preview here at all.
 *
 * Separate from `classifyCameraError` because it is answerable before asking:
 * a browser with no `mediaDevices` must render the "No camera here" panel
 * rather than a frame that will never fill, and must not raise a permission
 * prompt to find that out.
 *
 * A desktop gets the same answer even with a webcam (maintainer review on
 * #329). Holding a bottle up to a laptop's front camera is not how anyone
 * scans a label, so the permission prompt is a cost with no payoff, and §4's
 * screenshot 08 is literally titled "Desktop or no camera". "Desktop" means no
 * coarse pointer: a phone or tablet has a touchscreen as its primary input, a
 * laptop with a touchscreen still reports a fine primary pointer.
 */
export function canUseLiveCamera(
  mediaDevices: MediaDevices | undefined = typeof navigator === 'undefined'
    ? undefined
    : navigator.mediaDevices,
  touchPrimary: boolean = typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse)').matches,
): boolean {
  return touchPrimary && typeof mediaDevices?.getUserMedia === 'function'
}

/** Stop every track, so the device indicator light goes out. */
export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop())
}
