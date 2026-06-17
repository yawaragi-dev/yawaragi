---
name: mobile-layout-bug-repro
description: Run a Playwright sweep at 3 mobile viewports (iPhone-12, iPhone-SE, Android-narrow) against localhost:3000 with age-gate + debug cookies set, hunt every element whose `scrollWidth > clientWidth` or whose rect escapes the viewport, screenshot each viewport. Use when a visitor reports a mobile-only layout bug — overflow, scroll, "panel too wide" — and you need ground truth before tweaking CSS. Confirms the bug, isolates the culprit element, and produces a screenshot you can send the user.
---

# Mobile layout bug repro

A 5-minute Playwright motion. Reaches for the same tools every time, executed three times in the 2026-06-14 session for the same class of bug. Encoded so the fourth + time is instant.

## Why this exists

The CSS-debug instinct is to open the dev-server and tweak. That fails for mobile-only bugs in two ways:

1. **Chromium-on-laptop says clean when iOS Safari is broken.** Several known iOS-Safari quirks (sr-only file-input intrinsic width leak, `overflow-x: hidden` vs `clip` semantics, viewport-unit weirdness, tooltip-positioning when the trigger is near the right edge) don't reproduce on Blink. A Chromium screenshot at iPhone viewport is not authoritative for iOS bugs — but it IS authoritative for "the layout is structurally fine on a known-correct engine, so the iOS-specific debugging is the next step."
2. **The visitor reports "the panel is wide" but doesn't know which element pushes the document.** `document.scrollWidth > document.clientWidth` is the signal. Hunting EVERY element with `scrollWidth > clientWidth` or `rect.right > viewportW` pinpoints the culprit — usually a tooltip with `w-max` near the right edge, an `sr-only` file input, or an explicit width that doesn't account for the scrollbar.

## When to run

- User reports any of: "panel too wide", "page scrolls horizontally on mobile", "tooltip cut off", "X extends past the edge".
- A self-review on layout-touching code where you want ground truth before merging.
- When you've already tweaked CSS and want to verify the fix doesn't introduce a new overflow elsewhere.

## Skip if

- The bug is desktop-only (use the standard dev-server instinct).
- You have a real iPhone in hand and can DevTools-into mobile Safari directly — that beats Chromium emulation.

## Prerequisites

- `pnpm dev` running on `localhost:3000` (or note the port if different).
- Playwright + Chromium executable available. The repo's Playwright is configured for testing; you can borrow its chromium via `pnpm exec tsx`. On Ubuntu 26+ where `pnpm exec playwright install` fails, fall back to system Chrome: `executablePath: '/usr/bin/google-chrome'`.
- Age-gate cookie value: `JSON.stringify({ v: 1, ts: Date.now() })` URL-encoded.
- Debug cookie: `yawaragi_debug=1` (HttpOnly server-side; setting it via Playwright addCookies bypasses the proxy gate).

## Process

### 1. Write the repro to `scripts/` (one-off)

Create `scripts/repro-mobile-layout.ts`. The script:

- Imports `chromium` from `@playwright/test`.
- Loops over three viewports: `{width: 390, height: 844}` (iPhone-12), `{width: 375, height: 667}` (iPhone-SE), `{width: 360, height: 800}` (Android-narrow).
- For each: creates a context, sets the age-gate + debug cookies, navigates to the page (e.g. `/en/scan?debug=1` or `/en/sake/<brandId>?debug=1`).
- (Optional) seeds `sessionStorage['yawaragi:debug:events']` with the user's exact trace if they sent one.
- Waits for the relevant test-id to appear.
- Runs `page.evaluate` to walk every `*` selector and collect findings where `scrollWidth > clientWidth + 1` OR `getBoundingClientRect().right > viewportW + 1`. Return findings as `{tag, cls (slice 100), testid, rect, scrollW, clientW, reason}`.
- Logs the doc-level `{viewportW, docScrollW, docClientW, bodyScrollW, bodyClientW}` so you can see at a glance whether the *document* is the wider-than-viewport thing.
- Screenshots `/tmp/<page-name>-<viewport-label>.png`.
- Closes the browser per viewport.

The script is intentionally not committed — see `feedback_no_psql_in_user_env.md` for the "tsx + env-file + Node-pg" shape. Same pattern: ad-hoc operator script that does one job then goes away.

### 2. Run

```
pnpm exec tsx --env-file=.env.local scripts/repro-mobile-layout.ts
```

If `pnpm exec tsx` works in this repo (it does for Yawaragi), no extra setup. If Playwright's bundled Chromium isn't installed (Ubuntu 26+ blocker), pass `executablePath: '/usr/bin/google-chrome'` to `chromium.launch()`.

### 3. Read the output

- **Empty `findings: []` AND `docScrollW === docClientW`** at all three viewports → layout is structurally fine on Chromium. The bug is iOS-Safari-specific. Move to phase 4.
- **Non-empty `findings`** → you have the culprit. Sort by `reason: 'viewport-escape only'` first (those are the elements visibly bleeding past); the test-id + class on each row tells you which component to fix.
- **`scrollW > clientW` on a parent** like `<section>` while ITS children show no escape → the children are *inside* the parent's overflow but the parent's overflow contributes to document scroll. Usually means an `<absolute>` tooltip / popover inside the parent. Search for `absolute` + `w-max` or large `max-w-*` near that test-id.

### 4. If Chromium is clean, the bug is iOS-Safari

When phase 3 shows clean Chromium but the user still reports the bug, hunt these iOS-Safari quirks in order:

1. **`<input type="file" class="sr-only">`** — iOS Safari renders the "no file chosen" hint at the input's intrinsic width despite `sr-only`'s `clip:rect(0,0,0,0)`. The intrinsic width (~190 px) can leak and push document scroll. Fix: `overflow-x: clip` on `<html>` AND `<body>` (NOT `hidden` — clip avoids scroll-restoration issues on history-back).
2. **`<aside>` / popover with `position: absolute` + `w-max` + `left-0`** — when the trigger sits near the right viewport edge, the popover extends past the viewport even when `opacity-0`. iOS Safari respects this in document scroll calc. Fix: same `overflow-x: clip` at the html/body level, OR cap the popover with `max-w-[calc(100vw-2rem)]`, OR position it with `right-0` flipping logic.
3. **`position: fixed` + transformed ancestor** — iOS-Safari sometimes treats the transformed ancestor as the containing block for fixed children. If you have `transform: ...` on `<html>`, `<body>`, or any ancestor of the fixed element, fixed-positioning breaks.
4. **Viewport units near the address bar** — `100vh` on iOS Safari accounts for the dynamic address bar inconsistently. `100svh` / `100dvh` are the fix.

For each quirk, search the codebase: `grep -rn 'sr-only.*input' src/` etc. Apply the matching CSS fix, re-run the Playwright sweep (it'll still be clean on Chromium — that's expected), then ask the user to hard-refresh the preview.

### 5. Output to user

Send:

- One screenshot per viewport (the iPhone-12 one is usually sufficient).
- A one-line summary: "Chromium repro clean at 390 / 375 / 360 px viewports — bug is iOS-Safari-specific. Most likely cause: [quirk from phase 4]. Pushed fix at [SHA]."
- The list of findings if non-empty, with the test-id + brief class slice so the user can map back to the component.

Doesn't replace a real iPhone test — but it gets you from "vague visitor report" to "specific element + specific iOS quirk" in 5 minutes.

## Failure modes to avoid

- **Skipping the multi-viewport sweep.** A bug that's at 390 px might not be at 375 px; the visitor doesn't know their viewport width. Always sweep all three.
- **Trusting "Chromium says clean" too far.** Chromium clean is necessary but not sufficient — see phase 4. Don't reply to the user with just the screenshot saying "it works for me on Chromium."
- **Forgetting cookies.** Without the age-gate cookie the proxy rewrites the route to `/<locale>` and you screenshot the landing page instead of the buggy one. Without the debug cookie the debug panel doesn't mount.
- **Reading from `git status`** instead of running the actual page in the browser. The CSS file may say one thing; the compiled bundle on `localhost:3000` may say another (esp. during Next dev hot reload).
- **Putting the repro script in `src/`** — it's a one-off. Use `scripts/` and delete after.

## Related skills / memories

- `feedback_visual_bugs_need_screenshots.md` — "screenshots before code-reasoning" — this skill is the screenshot-engine for layout bugs specifically.
- `feedback_no_psql_in_user_env.md` — "tsx + env-file + Node-pg" pattern — same shape for the ad-hoc script.
