# ADR-0012: Webview-able architecture — Capacitor-primary wrap without UI rewrite

## Status

Decided — 2026-06-05

## Context

The M3 reorder (label scan first, suggestions and MCP next, auth deferred) brought mobile distribution onto the roadmap as "architecturally ready now, packaged later." Casual usage conflates three very different mobile paths:

| Path | Render target | What ships | Rewrite required? |
|---|---|---|---|
| **Capacitor** | Deployed web app in `WKWebView` / Android `WebView` | Built Next.js (statically exported or pointed at hosted backend) + thin native shell | None — same DOM, same React, same Tailwind |
| **Tauri 2 (Mobile)** | Native webview hosting a built web bundle | Static web bundle + Rust shell | None — same DOM |
| **Expo Router / React Native** | Native UIKit/Android views via React Native | A React Native bundle | **Total UI rewrite** — `<div>`/`<button>`/Tailwind don't exist; you use `<View>`/`<Pressable>`/Nativewind |

Expo Router is not a webview — it's a parallel React tree that happens to share file-system routing conventions. Listing it next to Capacitor in design discussion produces vague constraints that don't actually constrain anything. This ADR pins the meaning.

Without an explicit rule, Phase 3 (label scan) and Phase 4 (suggestions) would have no architectural reason to avoid features that quietly preclude a future wrap — middleware-on-device dependencies, native-bridge-only SDKs, browser-only globals — and rediscovering each one during a packaging sprint is dramatically more expensive than not introducing them in the first place.

## Decision

**"Webview-able" means**: the Next.js app, as built today, can be wrapped in a native webview shell — **Capacitor primary, Tauri Mobile as the documented secondary** — and shipped to App Store / Play Store **without a UI rewrite**.

The architectural rule that follows:

> Any feature that wouldn't survive being loaded inside a `WKWebView` pointed at our hosted backend (or, alternately, against a statically-exported bundle) is out of scope.

Explicitly permitted, with no further work required:

- **RSC + Server Actions** — the wrap calls them as ordinary cross-origin fetches against the hosted backend. The current Yawaragi backend on Vercel becomes the production API host for the wrap.
- **next-intl** — locale resolution from cookie/header works identically inside the webview.
- **Cookies** the project already issues (`yawaragi_age_gate`, `yawaragi_consent`, `yawaragi_session`) — Capacitor's cookie bridge preserves cross-origin cookies set by the hosted backend on `WKWebView` (iOS 14+) and Android's `CookieManager`.
- **HTML5 file/camera input** (`<input type="file" capture="environment">`) — identical behaviour to mobile Safari / mobile Chrome.
- **Tailwind, shadcn/ui, the existing design system** — all DOM; all unaffected.

Explicitly forbidden in Phase 3 and Phase 4 work:

- Features that require **Next.js middleware running on-device**. The wrap's eventual rendering mode (hosted backend vs static export) is undecided; both must remain viable.
- **Vendor SDKs that demand a native bridge not provided by Capacitor's standard plugins** (e.g. proprietary biometric SDKs, vendor analytics that ship as iOS frameworks). If a vendor offers only a native SDK, route through a web-compatible alternative or leave the feature for a future native slice.
- **Globals or APIs only available in a Node-backed Next.js server context that the client also touches** (mixing `process.env` access into client code, for example).
- **Browser-only globals without feature-detection** (e.g. `window.crypto.subtle` usage that breaks on older webview engines without a polyfill).

Wrapper packaging — the actual `@capacitor/core` / `@capacitor/ios` / `@capacitor/android` integration and the App Store submissions — is **deferred**. It lands as a separate slice (provisionally between Phase 4 closeout and any auth resumption) once the in-browser product is validated. Until then, the rule above is the only obligation.

The Expo / React Native rewrite path is **a separate decision**, deferred further. If the Capacitor wrap proves insufficient (native UX requirements, native-only feature need, performance constraint), the rewrite is reconsidered against the then-current product — not committed to ahead of time.

## Consequences

**Phase 3 (label scan) constraints:**

- Capture path is HTML5 `<input type="file" capture="environment">` (no `getUserMedia` / `<canvas>` MediaDevices flow in v1). Per ADR's "without a UI rewrite" rule, the native OS picker is the universal path. A nicer in-app live-preview UX is permitted in a later slice provided it falls back cleanly outside the wrap.
- Image downscale runs client-side via `<canvas>.toBlob` — no `sharp` server dependency.
- The wire shape (Server Action over `<form>`) works identically against a hosted backend from inside the wrap.

**Phase 4 (suggestions) constraints:**

- The Server Action call site for `suggestAction` is a normal fetch from the wrap's perspective — unchanged behaviour.
- MCP transport (whichever the Phase 4 slice picks — stdio subprocess or HTTP) must run **server-side**, not in the webview. The wrap calls our hosted backend; our backend talks to MCP.

**Cookie portability:**

- `yawaragi_age_gate`, `yawaragi_consent`, and `yawaragi_session` all need to be readable inside the wrap. Capacitor's WebView preserves cookies set by the hosted backend across `WKWebView`/`Android WebView` sessions when the wrap is configured to point at the backend's origin (rather than serving local files). When the wrap configuration is finalised, the cookie-domain story gets verified in a packaging-slice acceptance test.
- The age-gate cookie's 1-year expiry must not be undermined by the wrap clearing cookies on app upgrade. Documented as a packaging-slice concern.

**i18n in the wrap:**

- Locale resolution via `Accept-Language` works as in any browser. The wrap can override by injecting a cookie at startup if it wants to honour the device locale unconditionally. Either path is a packaging-slice concern, not a Phase 3/4 one.

**What this rules out without explicitly saying so:**

- A Phase 3 dependency on **Service Workers as a load-bearing feature** (e.g. requiring a Service Worker for offline scan capture). Service Workers work in WebView but the integration cost in Capacitor is non-trivial — defer.
- A Phase 4 dependency on **WebRTC** for chat-style streaming. Suggestions are already single-shot per ADR-0007's design (TODO when filed); WebRTC was never in scope.
- **Anthropic's `client.files.*` Files API** — already forbidden by CLAUDE.md for ZDR/retention reasons; reinforced here because Files API uploads from a webview run into additional CORS and credential-passing complications the wrap would have to solve.

**Wrapper packaging — the deferred slice:**

When packaging lands, the slice covers:

- Decide between Capacitor pointing at hosted backend vs Capacitor + static export
- `@capacitor/core` + `@capacitor/ios` + `@capacitor/android` install (subject to `minimumReleaseAge` quarantine; document any `minimumReleaseAgeExclude` entries needed)
- Cookie-domain verification (the production hosted-backend origin + the `capacitor://` / `https://localhost` wrap origin must agree)
- Universal links / deep links for App Store reviewability
- App Store + Play Store metadata, privacy disclosures, age-rating questionnaire (drinks-content)
- Apple Developer Program $99/yr and Google Play Console $25 one-time enrollment (carry-forward maintainer action; not blocking until packaging)
- A small smoke E2E (Playwright + Capacitor) covering: age-gate accept, scan submit, suggestion query

**RN / Expo path stays explicitly off the table** until: (a) a packaged Capacitor wrap is in production for at least a quarter, (b) measurable user demand for native-only behaviour exists, (c) the cost of a full UI rewrite is justified by something concrete. None of those are true today.

## References

- [ADR-0009: GDPR compliance posture](./0009-gdpr-compliance-posture.md) — cookie inventory and retention rules apply identically in the wrap; cookie portability becomes an acceptance test at packaging.
- [`CLAUDE.md`](../../CLAUDE.md) — RSC-by-default, Anthropic Files API forbidden, `'use client'` only with concrete reason — all reinforced here.
- [Capacitor docs: WebView configuration](https://capacitorjs.com/docs/web/) — vendor reference for the packaging slice.
- [Tauri Mobile](https://tauri.app/v2/blog/tauri-20/) — secondary wrap option; not the default.
- Handoff `/tmp/yawaragi-handoff-2026-06-05.md` and the M3-reorder grill session that produced this ADR.
