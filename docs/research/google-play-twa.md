# Google Play: what a listing would take

Status: **not decided** (#480). This is input for the maintainer's decision, not a plan. Checked against Google's own pages on 2026-11-01; each fact below names where it comes from. Anything not checked there is marked as such.

## What it would be

A Trusted Web Activity (TWA): a thin Android app that opens the live site full-screen in Chrome, without the address bar. The content stays the site on Vercel, so the web manifest, icons and offline page from #468, #483 and #496 are what it shows; there is no second codebase. Chrome's docs use **Bubblewrap** (`bubblewrap init` → `bubblewrap build`) to generate and sign the Android App Bundle from the web manifest ([Android concepts for web developers](https://developer.chrome.com/docs/android/trusted-web-activity/android-for-web-devs)). PWABuilder is an alternative we have not checked.

Today's install path (Chrome on Android mints a WebAPK; iPhone uses Share → Add to Home Screen) needs none of this. A Play listing only adds discoverability in the store.

## What it needs

**In the repo (a few hours)**

- `public/.well-known/assetlinks.json` with the app's package name and the SHA-256 fingerprint of the **Play App Signing** key (Play Console → Setup → App integrity → "App signing key certificate"), plus the upload key's fingerprint for locally installed builds. Without a matching fingerprint the app opens as a Custom Tab with a browser bar ([same Chrome page](https://developer.chrome.com/docs/android/trusted-web-activity/android-for-web-devs)). The dotted path already skips the proxy and the age gate (`src/proxy.ts` matcher excludes `.*\..*`).
- A Bubblewrap project (could live outside this repo) and its signing key, kept like any other secret.
- A yearly rebuild for the target API level: from **31 August 2026**, new apps and updates must target **Android 16 (API 36)** ([target API requirements](https://developer.android.com/google/play/requirements/target-sdk)).

**In the Play Console (the maintainer's, not an agent's)**

- A developer account: **US$25** one-time ([registration](https://support.google.com/googleplay/android-developer/answer/6112435)). An organisation account needs a **D-U-N-S number** ([account types](https://support.google.com/googleplay/android-developer/answer/13634885)).
- A personal account created after 13 November 2023 must run a **closed test with at least 12 testers opted in for 14 days in a row** before it can apply for production ([testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465)). That is the main calendar cost.
- Content rating questionnaire, target audience (adults), and the data safety form. Not checked in detail: the exact target-audience options for an 18+ app.
- **Account deletion**: an app with sign-up must offer an in-app path to delete the account and its data, and a web link where deletion can be requested ([account deletion](https://support.google.com/googleplay/android-developer/answer/13327111)). Account → Delete account (`deleteMyAccount`) is the in-app path, and the TWA shows the same page. Not checked: whether Play accepts a web link that sits behind sign-in, which `/account` does.

## Content policy

Alcohol is not banned. Play's Tobacco and Alcohol policy rules out encouraging illegal or inappropriate use, depicting or encouraging use or sale to minors, and favourable portrayal of excessive, binge or competition drinking; it asks for age-gating for the **sale** of alcohol ([inappropriate content](https://support.google.com/googleplay/android-developer/answer/9878810)). Yawaragi sells nothing and already follows stricter rules (JMStV copy rules, the 18+ gate, ADR-0006).

## GDPR

No new processing in the app: the TWA shows the same site, with the same cookies and the same vendors. Google becomes a distribution channel; the data safety form has to describe what the site already collects (ADR-0009's RoPA is the source). The developer account's public contact details are personal data of the maintainer: not checked which of them a personal account shows.

## App Store

Not covered here. A wrapper around a website risks rejection under Apple's guideline 4.2 (minimum functionality); the issue's view is "not now".
