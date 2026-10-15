'use client'

// `'use client'` is load-bearing here: this component owns a file input
// with a change handler, runs the canvas downscale in the browser, holds
// the `URL.createObjectURL` for the visitor's photo preview, and calls
// `useActionState`. Every one of those is a concrete client-only need
// per CLAUDE.md.

import { startTransition, useActionState, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslations } from 'next-intl'
import {
  ArrowsDownUp,
  ArrowsOut,
  Camera,
  CameraRotate,
  ClockCounterClockwise,
  EyeSlash,
  HandPalm,
  Drop,
  SquaresFour,
  ArrowsClockwise,
  Receipt,
  SelectionSlash,
  HourglassMedium,
  ImageBroken,
  Lightning,
  ListBullets,
  ListNumbers,
  MagnifyingGlass,
  UserCircle,
  ListMagnifyingGlass,
  CaretRight,
  WarningCircle,
} from '@phosphor-icons/react/dist/ssr'
import { useRouter } from 'next/navigation'
import { getPathname } from '@/i18n/navigation'
import { CameraCapture } from '@/components/scan/camera-capture'
import { ProvenanceBadgeView } from '@/components/sake/provenance-badge'
import { resolveBadgeKind } from '@/lib/provenance/policy'
// Per ADR-0014, attribution should render conditionally on the
// rendered-source-set. In scan-form we render brewery kanji from a
// Sakenowa-sourced brewery row in every status that mounts
// `SakenowaAttributionView` (matched / matched_brand_only /
// matched_brewery_only / ambiguous / consensus / confirm), so
// unconditional rendering matches the predicate today. When the
// scan flow can land on a fully-manual (brand AND brewery both
// `manual_curation`) record, thread sources through
// `ScanActionState` and gate these renders with
// `requiresSakenowaAttribution(sources)` from sakenowa-attribution.tsx.
import { CellarButton } from '@/components/collection/cellar-button'
import { TastingLogPanel } from '@/components/journal/tasting-log-panel'
import { OtherCandidates } from '@/components/scan/other-candidates'
import { ScanBottlings } from '@/components/scan/scan-bottlings'
import { bottlingNameFromRead, detailsFromRead, gradeLabel } from '@/lib/scan/read-bottling'
import NextLink from 'next/link'
import { SignInInPlace } from '@/components/auth/sign-in-in-place'
import { ScanOutcome, readName, type OutcomeCandidate } from '@/components/scan/scan-outcome'
import { ScanResultCard } from '@/components/scan/scan-result-card'
import type { DebugEvent } from '@/lib/debug/debug-log'
import { appendDebugEvents } from '@/lib/debug/debug-store'
import {
  browserBitmapDecoder,
  browserCanvasFactory,
  downscaleImage,
} from '@/lib/scan/downscale'
import { scanAction } from '@/lib/scan/scan-action'
import { readListAction } from '@/lib/scan/list-action'
import { INITIAL_LIST_ACTION_STATE, type ListActionState } from '@/lib/scan/list-action-state'
import { ListProblem, ListReading, ListResults } from '@/components/scan/list-results'
import {
  INITIAL_SCAN_ACTION_STATE,
  type BothPhotosGuess,
  type ScanActionState,
  type ScanCandidate,
} from '@/lib/scan/scan-action-state'
import { EARLIER_READ_TTL_MS, earlierReadOf } from '@/lib/scan/earlier-read'
import { appendMatchToHistory } from '@/lib/scan/scan-history'
import { rememberScannedPhoto } from '@/lib/scan/scanned-photo'
import { useScanHistoryConsensus } from '@/lib/scan/use-scan-history-consensus'
import type { Locale } from '@/i18n/routing'

interface ScanFormProps {
  locale: Locale
  /**
   * Server-rendered debug-mode flag (sourced from the `yawaragi_debug`
   * cookie at request time, since the cookie is HttpOnly and not
   * readable from client JS). When true, the form pushes its
   * per-step events (file picked, downscale done, action returned)
   * into the app-level debug store; the layout's `<DebugPanelMount />`
   * picks them up and renders them. When false, every push is a
   * no-op.
   */
  debugMode?: boolean
  /**
   * Whether this visitor can keep a journal (ADR-0020), decided on the server.
   * When true, a match carries §5's log panel; otherwise the card shows no
   * star at all, because a star that saves nothing is a dead affordance.
   */
  canLog?: boolean
  /**
   * Whether the visitor is signed in at all. Design v1.7 §5a: a menu or a
   * shelf offers "Rank these for you" to a visitor with a journal, "Sign in
   * to rank these" to one who is signed out, and the one-bottle-at-a-time
   * copy to anyone else — a signed-in visitor without a journal has no
   * palate to rank for, and a sign-in prompt would loop.
   */
  signedIn?: boolean
}

/**
 * `<ScanForm />` — the client-side capture surface.
 *
 * Flow (post-ADR-0015 / #163, and §4 for step 1):
 *   1. Visitor sees `<CameraCapture />` — §4's viewfinder, with the shutter
 *      capturing from a live stream and a gallery button opening the photo
 *      library. It used to be two text buttons ("Take photo", gated on
 *      `(any-pointer: coarse)`, and "Upload photo"), each wired to its own
 *      hidden file input. The library input is still here and is still the
 *      path ADR-0012 guarantees; the `capture="environment"` one is gone,
 *      replaced by the live stream where it works and by screenshot 07's
 *      panel where it does not.
 *   2. On change, we hold onto the raw file (for a client-only
 *      `URL.createObjectURL` preview that never leaves the browser)
 *      AND downscale it via `<canvas>.toBlob` +
 *      `createImageBitmap({ imageOrientation: 'from-image' })`.
 *   3. We submit a `FormData` carrying the downscaled JPEG to the
 *      `scanAction` Server Action via `useActionState`.
 *   4. On a `matched` result we render `<ScanResultCard />` IN PLACE —
 *      photo + name + flavor chart + a "Full bottle page" row. The
 *      previous S1/S3 behaviour of `router.push`ing to `/sake/[brandId]`
 *      is gone (see ADR-0015).
 *
 * Every non-match state (`low_confidence`, `no_match`, `ambiguous`,
 * divergence variants) also stays on `/scan` and renders discovery-
 * framed copy — never "error" tone. The route as a whole is age-gated
 * upstream by the proxy so no flavor data reaches an unaccepted visitor.
 *
 * The camera is hidden once any result is on screen (`hasResult`): each
 * result state carries its own "Scan again", so leaving a viewfinder above
 * the answer just stacks a second way to do the same thing. The message-only
 * states keep it — see the comment on `hasResult` for which those are and
 * why. A "Scan again" dismisses the result and the viewfinder returns; see
 * `view` for why that is one value rather than five conditions.
 */
/** The three §5a outcomes for a photo that is not of one bottle. */
const NOT_ONE_BOTTLE = {
  menu: { testId: 'scan-result-menu', icon: Receipt },
  several_bottles: { testId: 'scan-result-several-bottles', icon: SquaresFour },
  no_bottle: { testId: 'scan-result-no-bottle', icon: SelectionSlash },
} as const

export function ScanForm({ locale, debugMode = false, canLog = false, signedIn = false }: ScanFormProps) {
  const t = useTranslations('scan.form')
  // ProvenanceBadgeView + SakenowaAttributionView are the sync presentational
  // halves; we resolve their strings via the client-side translator since this
  // module is `'use client'`. The badge's policy (don't render canonical
  // sources) is enforced by the action's tagged state — it only attaches when
  // the extraction came back with source: 'llm_extracted'.
  const tBadge = useTranslations('provenance.badge.llmExtracted')
  const tProvenanceSheet = useTranslations('provenance.sheet')
  // Reused for the brewery label on the enriched no_match state (the
  // same label the sake detail page and result card render).
  // §8's "Type it": the bridge the non-match states offer.
  const tOutcome = useTranslations('scanOutcome')
  const router = useRouter()
  // One file input: the photo library.
  //
  // There used to be two, so the visitor got a deterministic choice between
  // the camera and the library without depending on the OS sheet — the second
  // pinned `capture="environment"`. §4 replaces it with a live viewfinder,
  // which is the same choice made better: the shutter captures from the
  // stream, and where the stream cannot open, screenshot 07's panel routes to
  // this input. Keeping a hidden `capture` input beside the camera would be a
  // third capture path with no affordance pointing at it.
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const [state, formAction, isActionPending] = useActionState<ScanActionState, FormData>(
    scanAction,
    INITIAL_SCAN_ACTION_STATE,
  )
  // §7: the whole menu or shelf, read from the same photo on request.
  const [listState, listFormAction, isListPending] = useActionState<ListActionState, FormData>(
    readListAction,
    INITIAL_LIST_ACTION_STATE,
  )
  /** The list screen is up, for this kind of list; `null` on the scan screens. */
  const [listOpen, setListOpen] = useState<'menu' | 'shelf' | null>(null)
  /**
   * The downscaled photo last sent to the scan, for "Rank these for you" to
   * send again. Memory only, like the preview: the server keeps no photo
   * between the two calls (ADR-0009).
   */
  const photoBlobRef = useRef<Blob | null>(null)
  /** The photo `listState` was read from. */
  const listReadFor = useRef<Blob | null>(null)
  const [isDownscaling, setIsDownscaling] = useState(false)
  // Boolean rather than the raw error message — we surface a polite,
  // discovery-framed i18n string ('errorDownscale'), not the raw browser
  // exception, to keep DACH copy on-brand.
  const [downscaleFailed, setDownscaleFailed] = useState(false)
  /**
   * The visitor tapped "Scan again" and is back at the viewfinder.
   *
   * Local, because `useActionState` has no reset: the action's last result is
   * still in `state` and will be until a new submission replaces it. This is
   * what makes `hasResult` false again so §4's camera screen returns.
   */
  const [resultDismissed, setResultDismissed] = useState(false)
  /**
   * #408: the scan on screen whose read is too old to resolve the next photo
   * with. The read itself is not copied anywhere — it is `state`, which
   * `useActionState` keeps until the next submission — so all that is needed
   * is to know when it has gone stale.
   */
  const [expiredState, setExpiredState] = useState<ScanActionState | null>(null)
  const earlierRead = state === expiredState ? null : earlierReadOf(state)
  // ADR-0015 / #163: the in-place result card shows the visitor's own
  // label photo. The URL is created from the ORIGINAL File the visitor
  // picked (pre-downscale — displays the friendliest quality). It never
  // leaves the browser: it's a `blob:` URL owned by this document and
  // is revoked as soon as we don't need it (new pick, form unmount).
  // Storing it in state (not a ref) so re-renders after `useActionState`
  // returns the matched result pick up the URL.
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  // "Not this bottling?" on a scan that opened the visitor's own bottling
  // (design v1.7, 85): which photo and bottling it was said for, so the next
  // scan opens directly again.
  const [lineViewFor, setLineViewFor] = useState<string | null>(null)
  const tBottling = useTranslations('bottling')
  const tCard = useTranslations('scan.resultCard')
  // Per-scan timing origin. Initialized to 0 so the ref initializer
  // stays pure for React 19's render-purity rules. `onFileChange`
  // writes the real epoch ms before the first event is pushed, so the
  // panel never sees a 0-based timestamp.
  const scanStartedAtRef = useRef<number>(0)
  // Tracks the last server `debugLog` we mirrored into the app-level
  // store so a re-render with the same state doesn't double-push the
  // same events.
  const lastServerLogRef = useRef<ReadonlyArray<DebugEvent> | null>(null)

  function pushClientEvent(message: string, data?: Record<string, unknown>): void {
    if (!debugMode) return
    appendDebugEvents([
      {
        tMs: Date.now() - scanStartedAtRef.current,
        source: 'ScanForm',
        level: 'info',
        message,
        data,
      },
    ])
  }

  // Reactive consensus over the per-tab scan history. When the
  // visitor's most recent scan lands in retry / low-confidence and a
  // strict majority of past successful scans in this tab agree on a
  // brand, we surface a "looks like X based on your recent scans"
  // card instead of the generic retry CTA — the visitor confirms
  // with one tap rather than rescanning again.
  const consensus = useScanHistoryConsensus()

  // ADR-0015 / #163: the auto-navigate `router.push('/sake/[brandId]')`
  // on a confident match has been removed. Every `matched` state now
  // renders `<ScanResultCard />` in place — the visitor's photo, the
  // brand kanji + romaji, the flavor chart, and an explicit "See full
  // details →" link back to `/sake/[brandId]` (still the deep-dive
  // permalink). The `matched_brand_only` / `matched_brewery_only`
  // divergence variants continue to render their divergence card in
  // place as they always have.
  //
  // Revoke the client-only object URL for the label photo when the
  // dependent value changes (React runs this cleanup with the previous
  // `photoUrl` closed over before running the next effect) OR when the
  // form unmounts. This is the single point of `revokeObjectURL` — a
  // second call from inside `onFileChange` would double-revoke.
  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl)
    }
  }, [photoUrl])

  // Mirror every successful match into the per-tab history so the
  // consensus mechanism can vote across recent scans. Tracks
  // `matched` (auto + confirm tier) and `matched_brand_only` (the
  // brewery-divergence path from #127) — those are the two states
  // that carry a real brandId + sakeHref. Idempotent against the
  // same state being re-rendered: we don't track timestamps to
  // dedupe because every action invocation produces a fresh state
  // object with a fresh `tMs` upstream.
  useEffect(() => {
    if (
      state.status === 'matched' ||
      state.status === 'matched_brand_only' ||
      state.status === 'matched_brewery_only'
    ) {
      // For brewery-only matches the extracted name_ja is the
      // misread brand kanji — store the brand's CATALOGUE kanji
      // (already on `brandDivergence.stored`) so the history's
      // displayed kanji and the consensus card both show the
      // correct value, not the hallucination. Same for the romaji:
      // the brewery-only state's `brandDivergence.storedRomaji` is
      // the catalogue brand's romaji; the other two carry it on
      // `sakeRomaji` directly.
      // Prefer the catalogue brand kanji over the model's
      // extraction whenever it's available — the canonical form is
      // always more accurate, and in the field-swap rescue path the
      // extraction's name_ja is the model's single-char hallucination
      // (not the brand at all). `matched_brand_only` carries
      // `sakeKanji`; `matched_brewery_only` puts the canonical brand
      // kanji on `brandDivergence.stored`; `matched` (auto / confirm
      // tier) doesn't carry it today, so fall back to extraction
      // there.
      const nameKanji =
        state.status === 'matched_brewery_only'
          ? state.brandDivergence.stored
          : state.status === 'matched_brand_only'
          ? state.sakeKanji
          : state.extraction.name_ja
      const nameRomaji =
        state.status === 'matched_brewery_only'
          ? state.brandDivergence.storedRomaji
          : state.sakeRomaji
      appendMatchToHistory({
        brandId: state.brandId,
        sakeHref: state.sakeHref,
        nameKanji,
        nameRomaji,
        tMs: Date.now(),
      })
    }
  }, [state])

  // #408: a read is usable for the next photo for a few minutes only.
  useEffect(() => {
    const timer = setTimeout(() => setExpiredState(state), EARLIER_READ_TTL_MS)
    return () => clearTimeout(timer)
  }, [state])

  // Mirror the server-side trace from the latest action result into
  // the app-level debug store. Guarded against re-renders that carry
  // the same `state.debugLog` reference: we only push when the array
  // identity changes (every action invocation produces a fresh array).
  useEffect(() => {
    if (!debugMode) return
    const serverLog = state.debugLog
    if (!serverLog || serverLog === lastServerLogRef.current) return
    lastServerLogRef.current = serverLog
    appendDebugEvents(serverLog)
  }, [debugMode, state.debugLog])

  // The list read's server trace, mirrored like the scan's.
  const lastListLogRef = useRef<ReadonlyArray<DebugEvent> | null>(null)
  useEffect(() => {
    if (!debugMode) return
    const serverLog = listState.debugLog
    if (!serverLog || serverLog === lastListLogRef.current) return
    lastListLogRef.current = serverLog
    appendDebugEvents(serverLog)
  }, [debugMode, listState.debugLog])

  function onUploadClick() {
    setDownscaleFailed(false)
    uploadInputRef.current?.click()
  }

  /**
   * Every in-result "Scan again" — §4's model is camera-first.
   *
   * It used to open the photo library, because there was no camera screen to
   * return to: the entry affordance was two buttons, and reopening the picker
   * was the shortest path. §4 makes the camera the Scan tab's screen, so a
   * rescan dismisses the result and the viewfinder is simply there again. One
   * tap to the camera, then the shutter — rather than one tap into an OS file
   * browser the visitor did not ask for.
   *
   * `useActionState` has no reset, so dismissal is local state that
   * `hasResult` reads. `handleFile` clears it, so the next result shows.
   */
  function onPickClick() {
    setListOpen(null)
    setResultDismissed(true)
    setPhotoUrl(null)
    setDownscaleFailed(false)
  }

  /** §5a → §7: read the whole list in the photo just scanned. */
  function onRankClick(kind: 'menu' | 'shelf') {
    const photo = photoBlobRef.current
    if (!photo) return
    setListOpen(kind)
    // Back from the list and "Rank these" again: the same photo was read
    // already, and reading it twice pays twice for the same answer.
    if (listReadFor.current === photo && listState.status === 'read') return
    listReadFor.current = photo
    const formData = new FormData()
    formData.set('image', photo, 'list.jpg')
    formData.set('kind', kind)
    formData.set('locale', locale)
    startTransition(() => listFormAction(formData))
  }

  async function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    await handleFile(file)
  }

  /**
   * One pipeline, two sources. The live camera hands a captured frame in here
   * as a `File`, exactly as the OS picker does through `onFileChange` — which
   * is what keeps the gallery a true fallback rather than a parallel
   * implementation (ADR-0012: "a build where the OS picker is unreachable
   * violates this ADR").
   */
  async function handleFile(file: File) {
    setDownscaleFailed(false)
    // A new attempt supersedes whatever the visitor dismissed to get here.
    setResultDismissed(false)
    setIsDownscaling(true)
    // New scan attempt — reset the relative-time origin so subsequent
    // events show time since pick. Events accumulate in the app-level
    // store (intentionally NOT cleared here) so the operator can scroll
    // back across multiple attempts.
    scanStartedAtRef.current = Date.now()
    pushClientEvent(`picked file "${file.name}" (${file.size} bytes, ${file.type || 'no MIME'})`)
    // Set up the client-only photo preview URL BEFORE the async
    // downscale kicks off. The effect below revokes the previous URL
    // when this state change lands.
    setPhotoUrl(URL.createObjectURL(file))
    // And hold it for the bottle page, which shows it in §9's bottle slot
    // when the visitor taps through from the result. Memory only — see
    // `scanned-photo.ts`.
    rememberScannedPhoto(file)
    try {
      const downscaleStart = Date.now()
      const downscaled = await downscaleImage(file, {
        decode: browserBitmapDecoder,
        createContext: browserCanvasFactory,
      })
      pushClientEvent(
        `downscaled to ${downscaled.size} bytes in ${Date.now() - downscaleStart}ms`,
        { ratio: Number((downscaled.size / file.size).toFixed(2)) },
      )
      photoBlobRef.current = downscaled
      const formData = new FormData()
      formData.set('image', downscaled, 'label.jpg')
      formData.set('locale', locale)
      // #408: what the last scan read, so a photo of another side can be
      // resolved with both. The server reads this photo blind and uses the
      // earlier read only if this one finds no single sake by itself.
      if (earlierRead) formData.set('earlierRead', JSON.stringify(earlierRead))
      pushClientEvent('submitting FormData to scanAction')
      // useActionState's action must be invoked from a transition. We
      // can't keep the await above inside startTransition (transitions
      // can't span an async boundary), so we open one here once the
      // blob is ready and let React schedule the action.
      startTransition(() => formAction(formData))
    } catch {
      // The downscale uses standard browser APIs (createImageBitmap,
      // canvas.toBlob) so a failure here usually means the file isn't
      // a decodable image — surface the localized hint, not the raw
      // exception (no promotional copy per JMStV).
      setDownscaleFailed(true)
      pushClientEvent('downscale failed; surfaced localized error', undefined)
    } finally {
      setIsDownscaling(false)
      // Reset the input so picking the same file again still fires onChange
      // (browsers suppress duplicate-value events). A camera capture never
      // goes through the input, so there is nothing to clear for that path.
      if (uploadInputRef.current) uploadInputRef.current.value = ''
    }
  }

  const isPending = isDownscaling || isActionPending

  // The two pickers are the ENTRY affordance: they are how a visitor with
  // nothing on screen starts a scan. Once a result is on screen, the
  // result owns the rescan — every non-match state renders its own "scan
  // again" button next to its copy, and the match states get the shared
  // row below. Keeping the entry pair at the top as well left two ways to
  // do the same thing stacked above the answer the visitor asked for,
  // which is what the maintainer caught on the low-confidence screen.
  //
  // The message-only states are deliberately NOT in here
  // (`invalid_input`, `session_missing`, `rate_limited`,
  // `extraction_failed`, and the client-side `downscaleFailed`): they
  // render a line of copy and nothing else, so the entry pair is their
  // only way forward and must stay.
  /**
   * What the screen shows, as opposed to what the action last returned.
   *
   * They diverge for exactly one reason: the visitor tapped "Scan again" and
   * is back at the viewfinder. `useActionState` has no reset, so `state` still
   * holds the dismissed result — and an earlier draft gated only the camera on
   * that flag, which put the viewfinder back UNDERNEATH the card it was meant
   * to replace. Deriving the whole view from one value makes that class of
   * half-dismissal impossible rather than fixing it five times.
   *
   * Message-only states are unaffected: nothing in them calls the dismisser,
   * so a rate-limit line cannot be tapped away while the limit still applies.
   */
  //
  // A read in flight shows the camera too. §4 is "capture → about 2s working
  // → result": the frame holds the captured still, sweeps, and says "Reading
  // the label…". Before this, a rescan from a result put the OLD result back,
  // faded, for the whole read — `handleFile` clears the dismissal at the start
  // of the read — so the working state only ever appeared on a first scan.
  const view = resultDismissed || isPending ? INITIAL_SCAN_ACTION_STATE : state
  // Design v1.7 (85): one of the visitor's bottlings fits the label, so the
  // scan opens it rather than the line.
  const fitting =
    view.status === 'matched' && canLog && Array.isArray(view.ownBottlings)
      ? view.ownBottlings.find((b) => b.fitsLabel)
      : undefined
  const fittingKey = fitting ? `${photoUrl}|${fitting.id}` : null
  const openFitting = fitting !== undefined && lineViewFor !== fittingKey

  const join = (...parts: (string | null | undefined)[]) =>
    parts.filter((p): p is string => Boolean(p)).join(' · ') || null
  // §5a's rows, for "Did you mean" and §5's "Not sure?" alike: a guess with
  // its reason in words, never a percentage.
  const candidateRow = (c: ScanCandidate): OutcomeCandidate => ({
    key: c.brandId,
    href: c.sakeHref,
    name: c.nameRomaji ?? c.nameKanji,
    kanji: c.nameRomaji ? c.nameKanji : null,
    where: join(c.breweryRomaji ?? c.breweryKanji, c.prefectureName),
    reason: tOutcome(
      c.sameBrewery
        ? c.reason === 'brewery'
          ? 'candidateReason.sameBrewery'
          : 'candidateReason.sameBreweryName'
        : `candidateReason.${c.reason}`,
    ),
  })

  // #408: the sake two photos together point at, as §5a's candidate row.
  const bothPhotosRow = (guess: BothPhotosGuess | undefined): OutcomeCandidate | undefined =>
    guess && {
      key: `both-${guess.brandId}`,
      href: guess.sakeHref,
      name: guess.nameRomaji ?? guess.nameKanji,
      kanji: guess.nameRomaji ? guess.nameKanji : null,
      where: join(guess.breweryRomaji ?? guess.breweryKanji, guess.prefectureName),
      reason: tOutcome('bothPhotos.reason'),
    }

  const outcome = renderOutcome()
  // §5a: every outcome — including the message-only ones — is a screen of its
  // own, with the rescan in its bar; the camera is not left up behind it.
  const hasResult = view.status === 'matched' || outcome !== null


  /**
   * §5a (design v1.5): the outcome screen for everything that is not a
   * match, or `null` while the camera is up or a match is showing. Each
   * branch only fills in the shared vocabulary of `<ScanOutcome />`.
   */
  function renderOutcome(): React.ReactNode {
    const readBadge = (id: string) => (
      // "Read by AI" — no percentage on this screen (v1.5 §5a).
      <ProvenanceBadgeView
        kind={resolveBadgeKind('llm_extracted')}
        label={tBadge('label')}
        explanation={tBadge('explanation')}
        sheetTitle={tBadge('sheetTitle')}
        closeLabel={tProvenanceSheet('closeLabel')}
        id={id}
      />
    )
    const icon = (Icon: typeof Camera) => <Icon size={28} />

    if (downscaleFailed) {
      return (
        <ScanOutcome
          testId="scan-error-downscale"
          icon={icon(ImageBroken)}
          kicker={tOutcome('badPhoto.kicker')}
          title={tOutcome('badPhoto.title')}
          body={tOutcome('badPhoto.body')}
          onRescan={onPickClick}
        />
      )
    }
    switch (view.status) {
      case 'matched_brand_only':
        return (
          <ScanOutcome
            testId="scan-result-matched-brand-only"
            icon={icon(ArrowsDownUp)}
            kicker={tOutcome('brandOnly.kicker')}
            title={tOutcome('brandOnly.title')}
            body={tOutcome('brandOnly.body', { line: view.sakeRomaji ?? view.sakeKanji })}
            onRescan={onPickClick}
            suggestOtherSide
            canKeep={canLog}
            read={{
              name: view.extraction.name_ja,
              brewery: view.extraction.brewery_ja,
              nameRomaji: view.extraction.name_romaji,
              breweryRomaji: view.extraction.brewery_romaji,
              badge: readBadge('scan-outcome-brand-only-badge'),
            }}
            candidates={{
              label: tOutcome('brandOnly.candidates'),
              rows: [
                {
                  key: view.brandId,
                  href: view.sakeHref,
                  name: view.sakeRomaji ?? view.sakeKanji,
                  kanji: view.sakeRomaji ? view.sakeKanji : null,
                  where: view.breweryDivergence.storedRomaji ?? view.breweryDivergence.stored,
                  reason: tOutcome('brandOnly.reason', { extracted: view.breweryDivergence.extracted }),
                },
              ],
            }}
          />
        )
      case 'matched_brewery_only':
        return (
          <ScanOutcome
            testId="scan-result-matched-brewery-only"
            icon={icon(ArrowsDownUp)}
            kicker={tOutcome('breweryOnly.kicker')}
            title={tOutcome('breweryOnly.title')}
            body={tOutcome('breweryOnly.body', { brewery: view.breweryRomaji ?? view.extraction.brewery_romaji ?? view.extraction.brewery_ja })}
            onRescan={onPickClick}
            suggestOtherSide
            canKeep={canLog}
            read={{
              name: view.extraction.name_ja,
              brewery: view.extraction.brewery_ja,
              nameRomaji: view.extraction.name_romaji,
              breweryRomaji: view.extraction.brewery_romaji,
              badge: readBadge('scan-outcome-brewery-only-badge'),
            }}
            candidates={{
              label: tOutcome('breweryOnly.candidates'),
              rows: [
                {
                  key: view.brandId,
                  href: view.sakeHref,
                  name: view.brandDivergence.storedRomaji ?? view.brandDivergence.stored,
                  kanji: view.brandDivergence.storedRomaji ? view.brandDivergence.stored : null,
                  where: view.breweryRomaji ?? view.extraction.brewery_romaji ?? view.extraction.brewery_ja,
                  reason: tOutcome('breweryOnly.reason', {
                    extracted: readName(view.extraction.name_ja, view.extraction.name_romaji),
                  }),
                },
              ],
            }}
          />
        )
      case 'ambiguous': {
        const candidates = Array.isArray(view.candidates) ? view.candidates : []
        const sharedBrewery = new Set(candidates.map((c) => c.breweryKanji)).size === 1
        return (
          <ScanOutcome
            testId="scan-result-ambiguous"
            icon={icon(ListBullets)}
            kicker={tOutcome('ambiguous.kicker')}
            title={tOutcome('ambiguous.title')}
            body={tOutcome('ambiguous.body')}
            onRescan={onPickClick}
            suggestOtherSide
            bothPhotos={bothPhotosRow(view.bothPhotos)}
            canKeep={canLog}
            read={{
              name: view.extraction.name_ja,
              brewery: view.extraction.brewery_ja,
              nameRomaji: view.extraction.name_romaji,
              breweryRomaji: view.extraction.brewery_romaji,
              badge: readBadge('scan-outcome-ambiguous-badge'),
            }}
            candidates={{
              label: tOutcome('ambiguous.candidates'),
              rows: candidates.map((c) => ({
                key: c.brandId,
                href: c.sakeHref,
                name: c.nameRomaji ?? c.nameKanji,
                kanji: c.nameRomaji ? c.nameKanji : null,
                where: join(c.breweryRomaji ?? c.breweryKanji, c.prefectureName),
                reason: sharedBrewery
                  ? tOutcome('ambiguous.reasonSharedBrewery')
                  : tOutcome('ambiguous.reasonName', { brewery: c.breweryRomaji ?? c.breweryKanji }),
              })),
            }}
          />
        )
      }
      case 'no_match': {
        // §5a "Did you mean": the nearest by name or brewery, each with its
        // reason in words. Older states (and an unreachable catalogue) carry
        // none, and the read card is the way forward then.
        const candidates = Array.isArray(view.candidates) ? view.candidates : []
        return (
          <ScanOutcome
            testId="scan-result-no-match"
            icon={icon(MagnifyingGlass)}
            kicker={tOutcome('noMatch.kicker')}
            title={tOutcome('noMatch.title')}
            body={tOutcome('noMatch.body')}
            onRescan={onPickClick}
            suggestOtherSide
            bothPhotos={bothPhotosRow(view.bothPhotos)}
            canKeep={canLog}
            read={{
              name: view.extraction.name_ja,
              brewery: view.extraction.brewery_ja,
              nameRomaji: view.extraction.name_romaji,
              breweryRomaji: view.extraction.brewery_romaji,
              badge: readBadge('scan-outcome-no-match-badge'),
            }}
            candidates={
              candidates.length > 0
                ? {
                    label: tOutcome('noMatch.candidates'),
                    rows: candidates.map(candidateRow),
                  }
                : undefined
            }
          />
        )
      }
      case 'low_confidence':
        return consensus ? (
          <ScanOutcome
            testId="scan-result-consensus"
            icon={icon(ClockCounterClockwise)}
            kicker={tOutcome('consensus.kicker')}
            title={tOutcome('consensus.title', { sake: consensus.nameRomaji ?? consensus.nameKanji })}
            body={tOutcome('consensus.body', { votes: consensus.votes, total: consensus.total })}
            onRescan={onPickClick}
            bothPhotos={bothPhotosRow(view.bothPhotos)}
          >
            {/* §5a (45): the two answers stacked full width, Yes first. The
                title names the sake; no separate kanji line under it. */}
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => router.push(consensus.sakeHref)}
                className="flex min-h-11 items-center justify-center rounded-xl border-[1.5px] border-ginshu-400 text-body font-medium text-ginshu-700 transition-colors hover:bg-ginshu-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
                data-testid="scan-result-consensus-accept"
              >
                {tOutcome('consensus.yes')}
              </button>
              <button
                type="button"
                onClick={onPickClick}
                className="flex min-h-11 items-center justify-center rounded-xl border border-ash-300 text-body font-medium text-ink transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
                data-testid="scan-result-consensus-rescan"
              >
                {tOutcome('consensus.no')}
              </button>
            </div>
          </ScanOutcome>
        ) : view.extraction.legibility === 'no_text' ? (
          // Design v1.7 §5a `no_text_this_side` (75): the photo is sharp and
          // this side has no writing, so "retake it" would be the wrong advice.
          // The photo back shows which side that was.
          <ScanOutcome
            testId="scan-result-no-text"
            icon={icon(ArrowsClockwise)}
            kicker={tOutcome('noText.kicker')}
            title={tOutcome('noText.title')}
            body={tOutcome('noText.body')}
            onRescan={onPickClick}
            primaryRescan
            photo={photoUrl ? { url: photoUrl, caption: tOutcome('noText.photo') } : undefined}
            bothPhotos={bothPhotosRow(view.bothPhotos)}
          />
        ) : (
          <ScanOutcome
            testId="scan-result-low-confidence"
            icon={icon(EyeSlash)}
            kicker={tOutcome('unreadable.kicker')}
            title={tOutcome('unreadable.title')}
            body={tOutcome('unreadable.body')}
            onRescan={onPickClick}
            suggestOtherSide
            bothPhotos={bothPhotosRow(view.bothPhotos)}
            tips={[
              { icon: <ArrowsOut size={18} />, text: tOutcome('unreadable.tipCloser') },
              { icon: <Lightning size={18} />, text: tOutcome('unreadable.tipLight') },
              { icon: <HandPalm size={18} />, text: tOutcome('unreadable.tipStill') },
            ]}
          />
        )
      case 'not_sake':
        // Design v1.7 §5a `not_sake` (71): the screen says what the label
        // says the drink is, and keeps the read editable so a wrong call is
        // one "Search again" away. No "Keep it anyway" (open decision 12).
        return (
          <ScanOutcome
            testId="scan-result-not-sake"
            icon={icon(Drop)}
            kicker={tOutcome('notSake.kicker')}
            title={tOutcome(`notSake.title.${view.drink}`)}
            body={`${tOutcome(`notSake.about.${view.drink}`)} ${tOutcome('notSake.body')}`}
            onRescan={onPickClick}
            read={{
              name: view.extraction.name_ja,
              brewery: view.extraction.brewery_ja,
              nameRomaji: view.extraction.name_romaji,
              breweryRomaji: view.extraction.brewery_romaji,
              badge: readBadge('scan-outcome-not-sake-badge'),
            }}
            aboutOtherDrinks
          />
        )
      case 'not_one_bottle': {
        // Design v1.7 §5a (72, 73): a menu or a shelf is the way into §7.
        const list = view.subject === 'menu' ? 'menu' : view.subject === 'several_bottles' ? 'shelf' : null
        const ranking = list === null ? null : canLog ? 'rank' : signedIn ? null : 'signIn'
        const copy = ranking === null ? '' : ranking === 'rank' ? '.rank' : '.signedOut'
        return (
          <ScanOutcome
            testId={NOT_ONE_BOTTLE[view.subject].testId}
            icon={icon(NOT_ONE_BOTTLE[view.subject].icon)}
            kicker={tOutcome(`notOneBottle.${view.subject}.kicker`)}
            title={tOutcome(`notOneBottle.${view.subject}${ranking ? '.rank' : ''}.title`)}
            body={tOutcome(`notOneBottle.${view.subject}${copy}.body`)}
            onRescan={onPickClick}
            // Design v1.7.1 (90): with no bottle there is no read worth
            // fixing, and shooting again is the whole answer.
            primaryRescan={view.subject === 'no_bottle'}
            read={
              view.subject === 'no_bottle'
                ? undefined
                : {
                    name: view.extraction.name_ja,
                    brewery: view.extraction.brewery_ja,
                    nameRomaji: view.extraction.name_romaji,
                    breweryRomaji: view.extraction.brewery_romaji,
                    badge: readBadge('scan-outcome-not-one-bottle-badge'),
                  }
            }
          >
            {list && ranking === 'rank' && (
              <button
                type="button"
                onClick={() => onRankClick(list)}
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl border-[1.5px] border-ginshu-400 px-4 text-body font-medium text-ginshu-700 transition-colors hover:bg-ginshu-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
                data-testid="scan-outcome-rank"
              >
                <ListNumbers size={18} aria-hidden="true" />
                {tOutcome('notOneBottle.rankThese')}
              </button>
            )}
            {list && ranking === 'signIn' && (
              // Sign-in opens over this screen, so the photo (memory only)
              // is still here afterwards and "Rank these for you" takes its
              // place. Only the no-JS fallback goes to the sign-in page.
              <SignInInPlace
                href={`${getPathname({ locale, href: '/sign-in' })}?redirect_url=${encodeURIComponent(getPathname({ locale, href: '/scan' }))}`}
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl border-[1.5px] border-ginshu-400 px-4 text-body font-medium text-ginshu-700 transition-colors hover:bg-ginshu-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
                data-testid="scan-outcome-sign-in-to-rank"
              >
                <UserCircle size={18} aria-hidden="true" />
                {tOutcome('notOneBottle.signInToRank')}
              </SignInInPlace>
            )}
          </ScanOutcome>
        )
      }
      case 'rate_limited':
        // v1.5's copy says "give it a minute"; our anonymous limit is per day
        // (5 scans / 24h), so the body keeps the honest wait in hours.
        return (
          <ScanOutcome
            testId="scan-error-rate-limited"
            icon={icon(HourglassMedium)}
            kicker={tOutcome('rateLimited.kicker')}
            title={tOutcome('rateLimited.title')}
            body={t('rateLimited', { hours: Math.max(1, Math.ceil(view.retryAfterSec / 3600)) })}
            onRescan={onPickClick}
          />
        )
      case 'extraction_failed':
      case 'session_missing':
        return (
          <ScanOutcome
            testId={view.status === 'extraction_failed' ? 'scan-error-extraction-failed' : 'scan-error-session-missing'}
            icon={icon(WarningCircle)}
            kicker={tOutcome('failed.kicker')}
            title={tOutcome('failed.title')}
            body={tOutcome('failed.body')}
            onRescan={onPickClick}
          />
        )
      case 'invalid_input':
        return (
          <ScanOutcome
            testId="scan-error-invalid-input"
            icon={icon(ImageBroken)}
            kicker={tOutcome('badPhoto.kicker')}
            title={tOutcome('badPhoto.title')}
            body={tOutcome('badPhoto.body')}
            onRescan={onPickClick}
          />
        )
      default:
        return null
    }
  }

  // §7 sits outside the scan form: its "Add it" opens a naming form of its
  // own, and forms do not nest.
  if (listOpen) {
    const back = () => setListOpen(null)
    if (isListPending || listState.status === 'idle') {
      return <ListReading kind={listOpen} onBack={back} onRetake={onPickClick} />
    }
    if (listState.status === 'read') {
      return <ListResults result={listState.result} onBack={back} onRetake={onPickClick} />
    }
    const problem =
      listState.status === 'rate_limited'
        ? { title: tOutcome('rateLimited.title'), body: t('rateLimited', { hours: Math.max(1, Math.ceil(listState.retryAfterSec / 3600)) }) }
        : listState.status === 'not_allowed'
          ? { title: tOutcome('notOneBottle.notAllowed.title'), body: tOutcome('notOneBottle.notAllowed.body') }
          : { title: tOutcome('failed.title'), body: tOutcome('failed.body') }
    return <ListProblem {...problem} onBack={back} onRetake={onPickClick} />
  }

  // The form is JS-only: there is no no-JS submit path because the canvas
  // downscale runs in the browser before we ever build the FormData. The
  // `onSubmit` handler exists so the Enter key on the button doesn't fall
  // through to a server post that would receive an empty body.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
  }

  return (
    <form onSubmit={onSubmit} data-testid="scan-form" className="flex w-full flex-col">
      <input
        ref={uploadInputRef}
        type="file"
        name="image-picker"
        accept="image/*"
        onChange={onFileChange}
        className="sr-only"
        data-testid="scan-file-input"
        aria-label={t('uploadAriaLabel')}
      />
      {!hasResult && (
        /*
          §4 Camera. This used to be two text buttons — "Take photo", gated on
          `(any-pointer: coarse)`, and "Upload photo" — which is what the Scan
          tab's main screen was: a heading, a paragraph and two buttons. The
          design gives the tab a viewfinder.
          
          Both of those buttons survive inside it: the shutter captures from
          the live stream, and the gallery button opens the same photo-library
          input the "Upload photo" button did. The native `capture="environment"`
          input is no longer surfaced — the live camera replaces it where it
          works, and where it does not, screenshot 07's panel offers the photo
          library instead, which is the path ADR-0012 guarantees.
        */
        <CameraCapture
          isWorking={isPending}
          onCapture={(file) => void handleFile(file)}
          onChoosePhoto={onUploadClick}
          typeItHref="/search"
          stillUrl={photoUrl}
          // Only once the visitor is back at the camera from a result: a
          // first scan has nothing to be read together with.
          notice={
            earlierRead && resultDismissed
              ? { testId: 'scan-camera-both-photos', text: tOutcome('bothPhotos.cameraNotice') }
              : null
          }
        />
      )}

      {/*
        Everything that is not the camera sits on the page gutter. The camera
        runs edge to edge (§4's ground); the results and messages used to share
        its zero-padding parent and ran flush against the screen edge.
        `empty:hidden` drops the gutter's padding when there is nothing in it.
      */}
      <div className="flex flex-col items-stretch gap-4 px-5 py-5 empty:hidden">

        {outcome}
        {view.status === 'matched' && (
          // v1.5 §5's bar: kicker · ghost "Not this one" back to the camera.
          // It replaces the "Scan again" button that sat under the card.
          <div className="flex min-h-11 items-center justify-between gap-3" data-testid="scan-result-bar">
            <span className="text-subtle text-ash-600" data-testid="scan-result-kicker">
              {openFitting ? tBottling('fitsLabel') : tOutcome('matchedKicker')}
            </span>
            <button
              type="button"
              onClick={onPickClick}
              disabled={isPending}
              className="-mr-2 flex min-h-11 items-center gap-1.5 rounded-md px-2 text-subtle font-medium text-ginshu-700 transition-colors hover:bg-ash-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600 disabled:opacity-60"
              data-testid="scan-result-match-rescan"
            >
              <CameraRotate size={16} aria-hidden="true" />
              {tOutcome('notThisOne')}
            </button>
          </div>
        )}
        {view.status === 'matched' && (
          // ADR-0015 / #163: the matched result renders IN PLACE on /scan
          // (previously auto-navigated to /sake/[brandId] on the auto tier
          // and rendered a text-only confirm card on the confirm tier).
          // Both confidence tiers now share the same rich `<ScanResultCard />`
          // — photo + kanji + romaji + provenance badge + flavor chart +
          // an explicit "Full bottle page" row. The tier information
          // survives inside `view.extraction.confidence`, which the
          // provenance badge renders as its confidence sub-label — that's
          // where a curious visitor can see how sure the system is about
          // its read.
          <ScanResultCard
            photoUrl={photoUrl}
            photoAlt={t('photoAlt')}
            sakeKanji={view.extraction.name_ja}
            sakeRomaji={openFitting ? fitting.name : view.sakeRomaji}
            bottlingOf={
              openFitting
                ? {
                    line: view.sakeRomaji ?? view.extraction.name_romaji ?? view.extraction.name_ja,
                    lineKanji: view.sakeRomaji ? view.extraction.name_ja : null,
                    href: view.sakeHref,
                    tags: [...(fitting.grade ? [gradeLabel(fitting.grade)] : []), ...(fitting.styles ?? [])],
                  }
                : undefined
            }
            breweryKanji={view.extraction.brewery_ja}
            breweryRomaji={view.breweryRomaji}
            sakeHref={view.sakeHref}
            // Resolved through the typed pathnames manifest rather than
            // appending "/similar" to `sakeHref`: the two routes happen to
            // share a spelling in both locales today, and a string append
            // would break silently the day one of them is localised.
            similarHref={getPathname({
              locale,
              href: {
                pathname: '/sake/[brandId]/similar',
                params: { brandId: String(view.brandId) },
              },
            })}
            flavorChart={view.flavorChart}
            extractionConfidence={view.extraction.confidence}
            readBottling={view.extraction.bottling}
            breweryPrinted={view.extraction.brewery_printed}
            // §5 Best guess: "Not sure? {n} other candidates" under the card.
            // Empty on a sure match, so the row is absent there.
            otherCandidates={
              openFitting ? (
                <button
                  type="button"
                  onClick={() => setLineViewFor(fittingKey)}
                  className="flex min-h-11 w-full items-center gap-3 border-y border-divider text-left text-subtle text-ink transition-colors hover:bg-ash-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
                  data-testid="scan-result-all-bottlings"
                >
                  <ListMagnifyingGlass size={18} aria-hidden="true" className="shrink-0 text-ash-600" />
                  <span className="flex-1">
                    {tCard('allBottlings', {
                      line: view.sakeRomaji ?? view.extraction.name_romaji ?? view.extraction.name_ja,
                    })}
                  </span>
                  <CaretRight size={16} aria-hidden="true" className="shrink-0 text-ash-500" />
                </button>
              ) : (
                <OtherCandidates
                  rows={(Array.isArray(view.otherCandidates) ? view.otherCandidates : []).map(candidateRow)}
                />
              )
            }
            // Rescan-in-flight fade: `isPending` covers both the browser-
            // side downscale AND the server round-trip. While either is
            // running, the visitor's fresh photo is already displayed
            // (set in `onFileChange`) but every other field is stale —
            // fading them tells the visitor "the previous match is
            // being replaced" without hiding their new bottle.
            isStale={isPending}
            logPanel={
              canLog && (
                // Keyed by brand: a rescan that lands on another sake starts a
                // fresh "Your take", not a re-rate of the last bottle's entry.
                // No history meta before the first tap — the scan does not
                // read the journal, and "First time for you" would be a guess.
                <div key={openFitting ? fitting.id : view.brandId} className="flex flex-col gap-3">
                  <TastingLogPanel
                    brandId={view.brandId}
                    // Design v1.7 (85): opened on the visitor's own bottling,
                    // the tasting lands on its page, not the line's.
                    {...(openFitting ? { expressionId: fitting.id } : {})}
                    sakeName={
                      openFitting
                        ? fitting.name
                        : (view.sakeRomaji ?? view.extraction.name_romaji ?? view.extraction.name_ja)
                    }
                    chart={view.flavorChart}
                    history={null}
                    // Nothing on /scan reads the journal, so there is nothing
                    // to refresh after a save.
                    onSaved={() => {}}
                  />
                  {/* §5's "Add to cellar" (wishlist is not built). The scan
                      does not read the cellar, so it starts at "Add to
                      cellar"; the first tap answers with the real count. */}
                  <div className="flex gap-2">
                    <CellarButton
                      target={openFitting ? { expressionId: fitting.id } : { brandId: view.brandId }}
                      name={
                        openFitting
                          ? fitting.name
                          : (view.sakeRomaji ?? view.extraction.name_romaji ?? view.extraction.name_ja)
                      }
                      initialCount={0}
                      refreshOnSave={false}
                    />
                  </div>
                  {openFitting ? (
                    <NextLink
                      href={getPathname({ locale, href: { pathname: '/bottling/[id]', params: { id: fitting.id } } })}
                      className="flex min-h-11 w-fit items-center gap-1.5 text-subtle font-medium text-ginshu-700 hover:text-ginshu-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ginshu-600"
                      data-testid="scan-result-open-bottling"
                    >
                      {tCard('openBottling')}
                      <CaretRight size={14} aria-hidden="true" />
                    </NextLink>
                  ) : (
                  <ScanBottlings
                    brandId={view.brandId}
                    lineName={view.sakeRomaji ?? view.extraction.name_romaji ?? view.extraction.name_ja}
                    suggestedName={bottlingNameFromRead(
                      view.sakeRomaji ?? view.extraction.name_romaji ?? view.extraction.name_ja,
                      view.extraction.bottling,
                    )}
                    readDetails={detailsFromRead(view.extraction.bottling)}
                    own={Array.isArray(view.ownBottlings) ? view.ownBottlings : []}
                    badge={
                      <ProvenanceBadgeView
                        kind={resolveBadgeKind('llm_extracted')}
                        label={tBadge('label')}
                        explanation={tBadge('explanation')}
                        sheetTitle={tBadge('sheetTitle')}
                        closeLabel={tProvenanceSheet('closeLabel')}
                        id="scan-bottling-read-badge"
                      />
                    }
                  />
                  )}
                </div>
              )
            }
          />
        )}
      </div>
    </form>
  )
}
