# Handoff: Yawaragi mobile app (webview)

**Design version 1.5 · 10 Oct 2026.** Source of truth is the Claude Design project; this folder is a snapshot. When a new version arrives, read the Changelog at the bottom first and implement only what changed. **If this README and the prototype disagree, the prototype wins** — and please report the mismatch.

## Overview
Yawaragi (和らぎ) is a sake companion app. You scan a bottle label or a restaurant menu, rate the sake with one tap, and build a journal. That journal also feeds a taste profile ("Palate") and a chat assistant ("Ask"). The main job is **identifying and assessing a sake at the table**. Logging is a side effect of rating.

It is built as a **mobile webview**, used in dim rooms (izakaya, bars) and designed dark-first. Tokens are documented so they can be ported to native later.

## About the design files
The files in this bundle are **design references built in HTML**. They are working prototypes that show the intended look and behaviour. They are **not production code to copy**. Rebuild them in the target codebase, using its framework, patterns and libraries. If there's no codebase yet, pick a suitable stack (for a mobile webview: React + TypeScript + Vite, or similar), set it up, and build there.

The prototypes are `.dc.html` files that run a small in-house template runtime (`support.js`). Don't port that runtime. Read each file's markup (inline styles) for layout and values, and its `class Component` logic block for state and behaviour.

## Fidelity
**High fidelity.** Colours, type, spacing, copy and interactions are final. Rebuild the UI pixel-close. Exceptions, which are data or copy placeholders:
- Catalogue, flavour charts, community notes, shops, menu rankings, palate numbers and Ask replies are **hand-written sample data**.
- Items marked **OPEN** under "Open decisions" need a product or legal decision before launch.

## How to run the reference
Open `Yawaragi Mobile.dc.html` in a browser, served over HTTP (e.g. `npx serve .` in this folder). Opening it as a `file://` URL may not load the runtime.
- On desktop it shows a 390×844 device frame. On screens under 520px wide it fills the screen with no frame.
- Add `?new=1` to the URL to start as a first-time user with an empty journal.
- `Yawaragi Mobile (phone).html` is a self-contained single-file build of the same prototype. It can be opened directly on a phone.

---

## App structure
- **Tab bar** (4 tabs, fixed at the bottom): Home · Scan · Collection · Palate. It is on **every screen except the age gate**, including the camera, results, detail screens and Ask. Sheets cover it while open. See rule 11.
- **Account** opens from the avatar at the top right of Home, Collection and Palate.
- **Camera:** Label only in v1. The Label / Menu toggle appears only when Menu scan is enabled (deferred).
- **Ask** is behind a flag and **off in v1**. When it's on, you reach it from a third Home tile, the Palate "Ask:" row, the result card's "What goes with it", and the Palate hints. Every Ask entry point is hidden when it's off; nothing links to it.
- **Market** (EU / Japan) changes the age gate, the cookie banner, and the chart-sharing default. **EU is the v1 ship.**
- **The landing page** is a separate, normally scrolling page outside the app shell.
- **Headers.** Tab main screens: title · avatar at the right (plus the interim EN/DE pair until `de` launches, ADR-0007). **Never Sign out** — it lives only on §15. Every other screen has its own top bar: back · title or kicker · at most one ghost action. Result and scan-outcome screens use their own bar, not the shared shell header.
- **Avatar** (36px circle), everywhere it appears: signed in = the initial on accent-200 in accent-800; signed out = person icon on neutral-200. That difference is the signed-in cue.
- **End of screen.** Every scrolling app screen ends with the same block (see "End-of-screen block" under Behaviour rules).

### Views
`gate` (age) → [cookie banner, EU] → `home` · `scan` → `result` | `outcome` (§5a) | `menu` (deferred) · `search` · `similar` · `sake` (bottle page) · `collection` (journal / cellar / wishlist) · `palate` → `axis` (flavour detail) · `account` · `ask` → `askHistory` (flagged).
Overlays: detailed-notes sheet, sign-in sheet, info sheets (cross-beverage, Japanese terms, serving temperatures, Read by AI), cookie banner, notice (toast), delete dialog.

### Screenshot key
Each screen below lists its reference screenshots (`screenshots/NN-*.png`, 390×844). Unless marked **JP** or **Ask on**, they show the v1 ship: EU, Ask off, Label only.

---

## Screens

### 0. Landing page (outside the app) · `Yawaragi Landing.dc.html`
A normal scrolling web page, not locked to the screen. Build it in the **port MR** (it's today's entry route and a legal-link home). If the full page must wait, ship the footer first.
- **Header** (max-width 1120px, padding 18px clamp(20px,5vw,56px)): "Yawaragi" 18px/500 plus 和らぎ 13px neutral-600 · locale switch **EN (selected) · "DE · soon"** (see §15 Language) · secondary button "Open the app" (38px).
- **Hero** (two columns that stack below ~700px): kicker with the accent mark "A journal for sake" · h1 "Know what's in the cup." (clamp 36–58px, −0.03em) · lead 17px · primary "Scan your first label" (48px, camera icon) · ghost "How it works" · small print "Free · no account needed · for adults 18+". Right: phone placeholder (9:19, radius 34) — **replace with a real app screenshot**.
- **Three features** ("Three things, done well"): Identify · Rate in one tap · Learn your palate. Surface cards, radius-lg, `--shadow-sm` (the hairline edge). **Icon and title share one row** at every width: 24px accent icon, 10px gap, 17px title, centred on each other; 14px body 8px below. Identify body: "Kanji or romaji — the camera reads whichever the bottle gives you. No camera? Use a photo, or type the name." ("or type the name" ships with §8; barcode returns with #342.)
- **Privacy promise** card (1px divider border): "Your journal stays yours" + "Open the app".
- **Footer** (full width, 1px top divider, inner max-width 1120px, padding 22px clamp(20px,5vw,56px) 30px, 12px neutral-600):
  - Left (flex 1, min 200px): "© 2026 Yawaragi · Flavour chart data **Powered by Sakenowa**" (link to sakenowa.com).
  - Right, wrapping nav (16px gaps): **Impressum · Privacy notice · Terms · Cookie settings · Drink responsibly**. Links accent-700, hover accent-800.
- **Cookie banner** (same rules as §2, including the floating-surface treatment — the v1.4 file's `shadow-md` was an artefact of its token set, not a choice): fixed card, max-width 560px, centred 16px above the bottom edge. While it's open the page gets extra bottom padding so the footer can scroll clear. "Cookie settings" reopens it in Customise with the current choices. **One consent covers the landing and the app** — store it on the shared domain.

### 1. Age gate · 01, 27 (JP)
- Full screen, **no tab bar**. Bottom-aligned stack, padding 32/26/40.
- **Law line** (the first line of copy):
  - Germany (EU default): "Under German youth-protection law (JMStV), Yawaragi is for adults 18 and over."
  - Austria: "Yawaragi is for adults 18 and over in Austria." · Switzerland: "…in Switzerland." (**legal wording to be supplied**)
  - Other regions: "Drinking age in **{region}** is {age}."
- "Not there?" ghost link (nowrap) opens region chips: **Germany · 18, Austria · 18, Switzerland · 18**, Japan · 20, United States · 21, United Kingdom · 18, South Korea · 19, Elsewhere · 18. EU mode defaults to Germany, JP mode to Japan.
- Primary button (50px, **nowrap**): "I'm {age} or older". Secondary (42px): "I'm not".
- "I'm not" → "Come back when you're {age}." plus a line of explanation and a ghost "I chose the wrong answer" link.
- **Locale switch** EN · DE, left of the footer links (DE is "coming soon", see §15 Language).
- **Footer links:** Impressum · Privacy notice · Terms.
- The region should come from the device locale, with the user able to change it. **OPEN: legal review of the figures and detection.**

### 2. Cookie banner (EU only) · 02, 03 (retaken 1.5)
- Appears **after** the age gate, never with it. **Does not block the app** — the screen behind stays usable.
- Bottom-anchored card, 10px from the sides, **88px from the bottom so it sits above the tab bar**; radius-lg, padding 14. It is a **floating surface**: `--color-raised` (#2d2b29) with `--shadow-float` (ring + upward shade + drop, see tokens); its buttons sit on neutral-300. The pane behind gets bottom padding equal to the banner's height while it is open, so the last content can scroll clear of it.
- Title "Cookies and similar storage", 15px/500. Body 12px: "We need some storage to run the app. With your permission we'd also like anonymous usage stats and crash reports. Nothing loads until you choose."
- Three buttons in a 3-column grid, **identical size and style** (secondary, 42px): Reject all · Customise · Accept all.
- **Customise** expands in place: title becomes "Choose what we store"; three toggle rows — "Needed to run the app" (on, locked), "Usage stats" (off), "Crash reports" (off). **Nothing pre-ticked.** The middle button becomes "Save choice".
- Nothing non-essential loads before a choice.
- **Withdraw:** Account → Privacy → Cookie settings reopens it in Customise with the current choices. Also from the landing footer.

### 3. Home · 04, 05 (first run), 28 (Ask on) — all retaken 1.5
- Header: greeting, plus the avatar (see App structure).
- **Action tiles — surfaces, not buttons.** Filled `surface` with `--shadow-sm`, radius-md, min-height 78px, padding 12/13, **icon top-left (22px), label bottom-left (13px)**, left-aligned. Hover neutral-200, pressed neutral-300. Only the Scan tile's icon is accent-600; the others neutral-700. Buttons stay outlines with centred content, so the two never read alike.
  - v1 (Ask off): **two tiles, 1.6fr · 1fr** — Scan a label · Type it (opens search). Until §8 ships, Scan alone.
  - Ask on: three tiles, 1.25fr · 1fr · 1fr — Scan · Type it · Ask.
  - **The tile row shows only once there are tastings.** First run never shows it, even when "Type it" returns.
- "Recent tastings": surface rows, **Latin name 16px, kanji 12px under it**, 12px stars, age at the right. **No thumb** (rule 14). Tapping a row opens that sake's bottle page.
- **First run (no entries):**
  - Surface card with the accent mark: "Start with the glass in front of you" / "Point the camera at the label, tap a star, and it's in your journal. No account needed." Three step cells (Scan the label or menu / One star and it's saved / Your palate forms at three). Primary "Scan a label", then ghost "Or type the name" (ships with §8). That is the only action pair on the screen.
  - **Cross-beverage cold start** below it — see §12 "Start from a drink you know".
- Ends with the end-of-screen block.

### 4. Camera (Scan tab) · 06 (retaken 1.5), 07, 08
- Ground is a fixed `#121110`. **The tab bar is shown**, with Scan active. **There is no ✕** — the tabs are the way out.
- **Top row:** a 3-column grid, `44px minmax(0,1fr) 44px`, padding 12px 14px, everything centred:
  - Left: empty 44px slot.
  - Centre, **Label only (v1):** "Scan a label", 15px/500, `#f6f2ea`, **one line** (nowrap, ellipsis as a last resort). With Menu scan on: the Label / Menu segmented control instead.
  - Right: light toggle (lightning icon). On = frame fill brightens from `rgba(255,255,255,.04)` to `rgba(255,240,225,.14)`. **iOS WKWebView: hide it; the 44px slot stays** so the title doesn't move.
- **Frame:** label 212×292 (menu 278×330), eased over 280ms. Corner brackets 30px, 2px accent-600, radius 10. While reading, an accent band sweeps top to bottom (`yw-sweep`, 1.5s, repeating).
- **Hint under the frame:** min-height 58px (may grow to 3 lines for German). 16px/500 title, 12px/1.45 hint, `text-wrap: balance`.
  - "Frame the bottle label" / "Kanji or romaji — whichever the bottle gives you." (Barcode returns with #342.)
  - Working: "Reading the label…" / "Matching against 12,400 catalogued sakes".
- **Bottom controls:** a `1fr auto 1fr` grid so the shutter is always centred. Left: "Type it" (12px, keyboard icon, **nowrap**; Label mode only, slot stays). Centre: shutter (66px ring, 52px accent fill). Right: gallery button.
- Capture → about 2s working → Result.
- **Permission denied** (07): the frame area becomes a left-aligned panel — camera-slash icon 32px · "Camera is off" 21px · "Yawaragi needs the camera to read labels. You can allow it, or use a photo you already have." · secondary "Allow camera" · **primary "Choose a photo"** · ghost "Type the name instead". Buttons 46/46/44px.
- **Desktop or no camera** (08): desktop icon · "No camera here" · "Add a photo of the label instead — from your files or a screenshot — or type the name." · dashed drop zone (140px, "Drop a label photo here, or click to choose") · ghost "Type the name instead".
- **The gallery is a complete fallback**: same pipeline as the camera.
- **Every "scan again" lands here** — this screen, with the live camera — on every device. It never opens the photo library directly; the gallery button on this screen does that.

### 5. Result card (the core screen) · 09, 10, 29 (Ask on), 34 (Done), 40 (best guess) — retaken / new 1.5
Top bar: back (to the previous screen) · kicker ("Matched from your photo" / "From the catalogue" / "Your own entry") · ghost "Not this one" (to the camera, §4). The bar replaces the shared header on this screen. **There is no "Scan again" button under the card**: the top bar is the rescan, and the Scan tab is the bottom-edge equivalent.

Card: surface, radius-lg, shadow-md.
- **Identity:** photo slot 92×122 **only when matched from a photo, showing that session's capture**; otherwise the slot collapses and the text takes the width (rule 14). Name 21px/500 −0.02em, kanji 13px, brewery 12px. Tags: **the match tag first** (accent, the one accent tag): "Sure match" (confidence ≥ 0.85) or "Best guess" (0.60–0.84, ADR-0015), then type tags (neutral). Last line: **credit "Catalogue data · Powered by Sakenowa ↗"**, 11px neutral-700, link underlined in neutral-500 (§17's caption style). Hidden for your own entries.
- **No provenance badge on the matched card.** Everything it shows is catalogue data; the model's reading only chose the row. The badge appears where model-read text is displayed (§5a).
- **Log panel** (below a divider, padding 14):
  - Before rating: neutral-100 background, "Your take" with the 2px accent mark, meta "Last logged {date} · {rating}" or "First time for you".
  - Star row: 5 stars, 34px, gap 4, each split into halves for half-star ratings. Filled `#cf8a6e`, empty `#4a4744`. `yw-pop` .3s with a 35ms stagger. Label beside it: "4.5 · Outstanding" (≥4.5 Outstanding, ≥3.5 Very good, ≥2.5 Solid, ≥1.5 Not for me, else Poured it out). **German: the label drops below the stars.**
  - Hint: "Tap a star and it's logged — notes can wait."
  - **Tapping a star saves immediately**: the panel turns accent-100, heading **"Logged"**, meta "21:40 · 2nd time" (or "first time"), notice "Logged · palate updated" with **Undo** for **6.8s**.
  - **Undo is one step:** the panel dims to 45% for 0.2s, then the panel (back to "Your take") and "You and this sake" update together.
  - After saving these fade in: note textarea ("Add a note — what struck you?", italic placeholder) · **quick chips** · a row of secondary "Add detailed notes" (flex 1; reads "Detailed notes" once any part is filled) and **"Done"** (accent outline: accent-600 border, accent-700 text, as in 35) · ghost "Delete tasting" (12px, neutral-600, trash icon).
  - **Quick chips** — a one-tap memory aid, *not* a palate signal. They never feed the TasteProfile in v1; confirming or disputing the six axes is a separate, later design (#244). Set: **this sake's two strongest chart axes** (e.g. "Rich · Floral", English axis words), then **Chilled · Warm · With food**. No chart → the last three only. Five maximum; they may wrap to a second row (German will). Axis chips appear only on screens that also carry the chart and its §16 caveat; anywhere else they need their own ⓘ. Serving temperature in detail stays in §10 — "Chilled" / "Warm" are the quick version and don't pre-fill it. Stored keys `axis:f1…f6`, `chilled`, `warm`, `withFood`; old `sourApple` / `ciderLike` stay readable.
  - **Done** answers "was it kept?": on the result card it folds the panel to one 52px line on accent-100 — check icon · "Logged · 4.0 · Very good — In your journal" · "Edit" (accent-700), which unfolds it. On the bottle page it closes the panel (§9).
  - **Delete tasting** confirms **inline**, inside the panel: a ground-coloured box with "Delete your 4.0 tasting of {name} from {DD.MM.YYYY}? This can't be undone." · ghost "Keep" · "Delete" (accent-100 fill, accent-700 border, as §15's dialog). After deleting, the notice "Tasting deleted" (no Undo — the confirmation was the safety). This is the per-record GDPR erasure path (ADR-0009).
  - Re-rating updates the same entry; notes and chips update live.
- **Best guess** (0.60–0.84): under the card, a 44px row "Not sure? {n} other candidates" (list icon, caret) expands an inline list of candidate rows (§5a). No separate screen.
- **Below the card:**
  - **Flavour chart** — the shared component, §17.
  - **Cross-beverage line** under the chart: "Interesting if you like Lagavulin 16" (13px/500) + the **Cross-beverage** provenance badge + caveat "Cross-beverage estimate, not a tasting note." (11px neutral-700) with the ⓘ inline after it (§16), opening the explanation sheet.
  - **"Similar sakes"** button → §6. With Ask on, also "What goes with it" (opens Ask with the question sent).
  - "Full bottle page" row (book icon, caret).
  - **Shelf row** (44px, 8px gap): the **cellar control** (see §9) · "Wishlist" / "On wishlist" (filled bookmark, accent-700).
  - The end-of-screen block.
- **Added by you** (not in the catalogue): chart, cross-beverage, similar and bottle-page row are replaced by a dashed card "Added by you" / "Not in the catalogue yet, so there's no chart or bottle page. It still counts toward your palate, and we'll link it if the sake turns up later. Only you can see it." No "Add a label photo" — photos are discarded after reading.

### 5a. Scan outcomes (new in 1.5) · 41–49
The pipeline's outcomes stay as the pipeline produces them; the design does not collapse them to three. Two share the §5 card (`matched` ≥ 0.85 "Sure match", 0.60–0.84 "Best guess"). Everything else is **one screen, `outcome`, with one shared vocabulary**:
- **Top bar** as §5: back · kicker · ghost **"Scan again"** (camera-rotate icon) → the camera, §4. **This replaces every inline "Scan again" button.**
- **Status block:** 28px icon in neutral-600 (never accent — nothing here is good news), title 21px/500, one or two lines of 13px neutral-700.
- **"What we read" card** (only when something was read): surface, radius-lg, shadow-sm. Section label "What we read" with the **Read by AI** badge at the right; editable fields **Name** and **Brewery** (44px, prefilled from the read, ground-coloured); hint "Misread? Fix it from the label and search again."; secondary "Search again" → §8 with the edited name. **No confidence on this screen** — the percentage is in the Read by AI sheet only.
- **Candidate rows** (when there are any): section label, then rows — Latin name 15px + kanji 12px · brewery · prefecture 12px · a **reason in words** 12px neutral-700 ("Same brewery · closest name", "Similar name · brewery 伴野, not 友野") · caret. **No % tag and no accent**: a candidate is a guess and must not look like a match. Tap → §5 card. Up to 3.
- **"Keep it anyway"** dashed card (whenever something was read): "Rate it and put it in your cellar now, with the name above. It's marked as your own entry, and we'll link it if the sake turns up in the catalogue." · secondary "Add this bottle" → §5 in "Your own entry" mode. Minimum to save: **a name** (prefilled); brewery optional.
- Last: ghost "Type the name instead" → §8.

| outcome | kicker | title | body (short) | parts |
|---|---|---|---|---|
| `matched_brand_only` (41) | Partly matched | We found the sake, not its brewery | The name matches {line}, but the brewery we read isn't the one it lists. | read · "Is it this one?" (1 row) · keep |
| `matched_brewery_only` (42) | Partly matched | We found the brewery, not the sake | {brewery} is in the catalogue, but none of its sakes goes by the name we read. | read · "From this brewery" · keep |
| `ambiguous` (43) | A few fit | Which one is it? | The label fits more than one sake in the catalogue. | read · "Closest in the catalogue" · keep |
| `no_match` (44) | Not in the catalogue | We read it, but can't find it | Fix anything we misread and search again — or keep it as your own entry. | read · "Did you mean" (nearest by brewery or name) · keep |
| `low_confidence` + consensus (45) | Unclear photo | This looks like {sake} | The photo was hard to read, but 3 of your last 4 scans were this sake. Is it? | primary "Yes, that's it" → §5 · secondary "No — scan again" |
| `low_confidence`, none (46) | Unclear photo | We couldn't read this label | Nothing on it was clear enough to look up. Another photo usually does it. | three 44px tip rows: Get closer · Turn on the light · Hold still |
| `rate_limited` (47) | Paused | Too many scans in a row | Give it a minute, then scan again. Typing the name works any time. | message only |
| `extraction_failed`, `session_missing` (49) | Not read | Something went wrong on our side | It wasn't your photo. Scan again, or type the name. | message only |
| `invalid_input`, downscale failure | Not read | We couldn't use that photo | Try another photo of the label — JPEG, PNG or HEIC. | message only |

Message-only states are not "plain copy on the ground": they get the same status block, the same top bar and the same "Type the name instead" exit, so a failure looks like the product, not like an error page. Prototype: the **Scan outcome** tweak picks the branch the next capture lands on.

### 6. Similar sakes · 15 (retaken 1.5)
- Plain ranked list, **no chat, no model call**. Reached from the result card and the bottle page.
- Header: back · "Similar to {name}".
- **Ranked by flavour distance: Euclidean (L2) over the six axes, top 5** — magnitude carries signal, so not cosine (matches `flavor-similarity.ts`). Displayed as "{n}% alike" = 1 − d / d_max. Row, **text only (no thumb, rule 14)**: name 15px/500, brewery 12px, tag "{n}% alike" (accent tag at ≥95, else neutral), and a one-line reason built from the axis differences, e.g. "Same rich and dry, less floral." Lead copy: "Closest by flavour distance across all six axes." Tapping opens that sake's result card.
- Empty (no profile for this sake): a short line and the bottle-page link.

### 7. Menu results — deferred · 33
Only with Menu scan on. Unchanged from v1.0:
- Top: back · "Read from your photo · 8 sakes" · "Retake". Headline 24px ("Order the Akishika") + sub "Ranked for your palate — … Prices per glass, as printed."
- Segmented "For you" / "Menu order"; filter chips "Good warm", "Under ¥1,000", "New to me".
- Ranked row: rank in the heading face (only #1 accent-600 with the mark) · matched name + glass price · name as printed + style (12px) · reason (13px, **2 lines then clamp**) · tags "{n}% for you" (accent ≥85), "★ {rating} · yours", "Good warm". Tap → result card.
- "Couldn't match · 2" → search, filled in. Top scroll fade.

### 8. Search ("Type it") · 18 (retaken 1.5)
- 44px field, accent-500 border, autofocus, placeholder "Name, brewery or kanji".
- Empty query: "Recently tasted". With a query: "{n} matches" (searches name, kana, brewery).
- Rows 58px, **text only**: name + kanji · brewery · tags · "Tasted" accent tag if you've had it. Tap → result card. Matching covers the name as printed on the label, including an importer's product name, grade or age attached to it ("Rihaku Wandering Poet" → 李白). No visual change.
- With a query, a dashed row "Add "{query}" yourself — Rate it now, details later" opens the result card in manual mode.

### 9. Bottle page (one per sake) · 16, 17 (little published), 35 (panel open), 36 (in cellar), 37 (edit + delete) — retaken / new 1.5
- Header: back · name (ellipsis). **Nothing else** — wishlist and cellar live in the content. **No sticky bottom bar** — the tab bar is the only thing on the bottom edge.
- Order, personal to general:
  1. **Identity**, text only (no bottle slot, rule 14): name 25px, kanji, brewery · place, tags; "Little published" neutral-outline tag when data is thin. Last line: **"Catalogue data · Powered by Sakenowa ↗"**, 11px neutral-700, underlined link, on the content column (x = the gutter, like every other line). This is the above-the-fold Sakenowa credit (see Answers, B8). Hidden for your own entries.
  2. **Action rows** (padding 10px 20px 0, 8px gaps):
     - Closed: primary "Rate a new tasting" (44px, flex 1) · secondary "Similar" (→ §6). Under it: **cellar control** (flex 1) · wishlist icon button (44×44, bookmark; filled + accent-700 when saved).
     - **"Rate a new tasting" opens §5's log panel in place**, in its own card (surface, radius-lg, shadow-md), taking that row's slot. Under it the row becomes: "Similar" · cellar control · wishlist icon. **Done** closes the panel back to the closed rows; the tasting is already in "You and this sake".
     - **Cellar control:** not owned → secondary "Add to cellar" (stack-plus). Owned → one outline split in two: **"In cellar · 2 ›"** (accent-700, a link to Collection → Cellar) | **"+"** (44px, aria "Add another bottle", adds one and shows the notice).
  3. **You and this sake:** your entries (date block, stars, italic note) with a ghost **"Edit"** at the right of each. Edit opens that tasting in the panel (heading "Your tasting · 19 Sep", meta "Changes save as you go"): rating, note, chips, detailed notes, Done, Delete. Or "Not tasted yet."
  4. **Serve it:** six temperatures (5° 雪冷え, 10° 花冷え, 15° 涼冷え, 20° 常温, 40° ぬる燗, 50° 熱燗), recommended ones in accent-500, plus a sentence. Without data: "The brewery hasn't said…"
  5. **The sake:** 2-column spec grid (Rice, Polishing, Yeast, Starter, SMV, Acidity, Alcohol, Water). Unknown: "Not published", italic neutral-700.
  6. **Flavour:** the shared chart, §17 — the first mention on the page, so the heading is "Flavour chart (Sakenowa)".
  7. **Goes with** (replaces Ask's "What goes with it"): 3 static pairing rows — icon 18px · food 14px · reason 12px. Example: "Grilled mackerel, saba shioyaki — The acidity cuts the oil; serve the sake warm." Without data: "No pairings for this one yet. By its style, try it with grilled or savoury dishes."
  8. **What others noticed:** notes (rating · place · when) and common-word tags, or "Nobody has written about this bottle yet…"
  9. **The brewery:** story plus **"Also from this brewery"**: a horizontal row of text cards (surface, shadow-sm, name 13px + meta 11px, no image) using the horizontal-row edge (rule 7). Hidden without data.
  10. **Where to find it:** shop rows, or "Not tracked in any shop yet…"
  11. The end-of-screen block.
- **Sections no bottle can fill yet are hidden, not stated** (today: Serve it, The sake, Goes with, What others noticed, Where to find it — #336–#340). Rule 4 still applies when data is missing for *one* bottle (e.g. the chart). The prototype shows them with sample data as the target.
- The bottle-vs-line split (a page for a specific bottling) is answered in writing in the Answers appendix, B-Line; it is drawn in 1.6.

### 10. Detailed notes (bottom sheet) · 11 (retaken 1.5), 38 (temperature sheet)
- Up to 90% height. Header: "Detailed notes", progress ("3 of 5 parts filled" / "All optional"), primary "Done". Opened from the log panel, and from a journal row's "Full notes" chip (§11).
- **"Tasted on"** first, above the intro: a 52px row — calendar icon · "Tasted on" 15px/500 · date field at the right (locale format: DD.MM.YYYY in en-GB and de). Defaults to the logging day; no future dates. Changing it moves the tasting in the journal and "You and this sake", and the Palate weighs it by that date. It stays here rather than in the panel's meta line: the star is the save, so the date is a correction made afterwards, never a question up front. No "moved" mark in the journal. (In the prototype the field steps back a day per tap; build it as the platform date picker.)
- Intro: "Look, smell, taste, decide — the order professional tasters work in. Fill any part, skip the rest; it saves as you go." **Never name a certification body.**
- Collapsible sections, 56px min-height headers (may grow), summary or hint under each title; the icon turns accent when filled. **Appearance open by default**, so the sheet reads top-down.
  - Appearance: Clarity (Clear / Slightly hazy / Cloudy) · Colour (Water-white / Pale straw / Gold / Amber).
  - Nose: Intensity (Light / Medium / Pronounced) · Aromas, pick any (Fruit, Flower, Steamed rice, Lactic, Koji, Nut, Earth, Aged).
  - Palate: five 5-step scales, 30px tap targets, 8px bars; tapping the current step clears it — Sweetness (Bone dry → Sweet), Acidity (Soft → Sharp), Umami (Clean → Savoury), Body (Very light → Heavy), Finish (Short → Lingering).
  - How you had it: Temperature — **six** chips, romaji then degrees ("yukibie 5°", "hanabie 10°", "suzuhie 15°", "jōon 20°", "nurukan 40°", "atsukan 50°"), the same six as §9; an ⓘ beside the field label opens the **Serving temperatures** sheet (§16) · Vessel (Ochoko / Guinomi / Wine glass / Masu) · "With" free text.
  - Conclusion: Drink it again? (Yes / Maybe / No) · Would suit, pick any (Everyday / With dinner / Special occasion / As a gift).
  - About the sake — **only for your own entries**: Rice, Polishing, Yeast, SMV. For catalogue sakes: "Rice, yeast and polishing come from the catalogue — see the bottle page." **Ships with manual entry**; until then neither line shows.
- No Save button; everything persists as you go.

### 11. Collection · 19, 20, 21 — retaken 1.5
- Header "Collection" 26px · search icon · avatar. Segmented: Journal · Cellar · Wishlist. **Wishlist is hidden until it ships**; never show an empty segment for an unbuilt feature.
- **Which segment opens:** the last one used (stored on the device). A first visit opens Journal. Links that name a segment (Home's "All →", a notice's "View", the bottle page's "In cellar · n ›") keep naming it.
- **Journal:** date block (18px day, 10px month) · **Latin name 16px, kanji 12px under it** · 11px stars at the right · italic note 12px neutral-700 · a **"Full notes"** neutral tag-button (list-checks icon, 28px, aligned with the name) on entries that have detailed notes, opening §10 for that tasting. Newest first; tapping the row opens the bottle page, where "Edit" lives. Rows are divided by 1px divider lines.
  - Backup card (signed out, ≥1 entry, not dismissed): "{n} tastings, only on this phone" / "Sign in to back them up… Nothing is posted publicly." / "Back up journal" · "Not now". Signed in: "Backed up · {n} tastings".
  - Empty: "Your journal starts with one star" + "Scan a label".
- **Cellar:** "{bottles} bottles · {open} open". Row, **text only**: name · "× n" · kanji · state line — "Unopened · keeps for months, cool and dark" (or "· nama, keep cold") · "Open {d} days · fridge" · drink soon "Open {d} days — best finished this week" (accent-700, hourglass, sorted first; ≥10 days, ≥5 for nama — **OPEN**). Actions: open → "Pour & rate" · "Finished"; unopened → "Open a bottle" · **"Remove one"** while there are several, "Remove" for the last. Each takes **one** bottle off the row. Brewery and *nama* appear when they are stored.
- **Wishlist:** "{n} sakes to try". Row: name · brewery · source ("Scanned at …" / "Saved from its bottle page"; with Ask on also "From Ask · …") · optional stock line. Actions: "Bought it" (→ cellar) · "Tried it" (→ result) · "Remove". **A sake leaves the wishlist once it's logged.**
- Adding anywhere shows a notice ("Saved to wishlist" / "Added to your cellar" / "Another bottle added · 2 in cellar") with **View**.
- Ends with the end-of-screen block.

### 12. Palate · 22, 23 (early), 24 (axis detail), 30 (JP + Ask on), 39 (early, drink picked), 50 (early, rating not live) — retaken / new 1.5
- **Header — the tab pattern** (also §3, §11): one 26px title, one 13px neutral-600 meta line, avatar at the right. No kicker, no third line.
  - ≥3 tastings: title = the strongest axis ("Rich, umami-forward"), meta "Derived from {n} tastings · updates as you log".
  - 1–2: title "Your palate", meta "Taking shape · so far {sake} {rating}" (this replaces the separate "So far" line).
  - 0: title "Your palate", meta "Not yet — it starts with your first tasting".
- **Under 3 tastings (23, 39, 50), in this order:**
  1. **Rating slot** — present **only once rating is available to the user**; absent today (the prototype's **Rating live** tweak). A 3px, 120px-wide three-segment bar plus one 12px line: "{n} more tastings and your first read appears. It learns from what you rate." No button.
  2. **"Start from a drink you know"** — the lead card (surface, radius-lg, shadow-sm, padding 16; also on first-run Home): accent mark + 19px title · "Pick one you already like. We'll sketch a starting palate from it now, and point you at sakes of the same shape." · chips Lagavulin 16 · Riesling Spätlese · Guinness · Fino sherry · Pinot Noir (36px). Picking one opens, under a divider, **"Starting sketch · from {drink}"** with the six axes as 4px bars (the §17 bar, no numbers) and its seed line, e.g. "Smoky and heavy — expect to like rich, dry, savoury sakes. Try kimoto or yamahai." The card always ends with the **caveat line inside it**: "Cross-beverage estimates, not tasting notes." + inline ⓘ (§16). Real ratings replace the seed from 3 tastings.
  3. **"Sakes to try next"**: section label with **"Powered by Sakenowa ↗" folded into the label row at the right** (the §17 caption style) — that is its attribution, no separate row. A 12px lead: before a pick "Three clear, different shapes to start with. Pick a drink above and these follow it."; after "Closest to {drink} by flavour chart." Then **three cards**, not six rows: Latin name 15px + kanji 12px · brewery · prefecture 12px · a reason 13px ("Same shape as Lagavulin 16: rich and dry.") · two neutral tags, its strongest axes. Only what we know: axes, brewery, prefecture — no photo, grade or price.
  4. The end-of-screen block.
  - Removed from the early screen: the tip card "Rate a few different styles" and its "Scan a label" button (a scan does not feed the palate; the Scan tab is one tap away).
- **3 or more (22):**
  - **Chart opt-in card** (EU, sharing not yet answered): see §15. Appears once.
  - Confidence card: "Early read · {n} of 10 tastings to a firm profile" / "Firm · based on {n} tastings", with a bar.
  - "What shapes it · tap to see why": 6 axis rows, **48px min-height (may grow)**, in the **canonical order Floral, Mellow, Rich, Mild, Dry, Light**. Each: your value bar (accent-500), a 2px neutral-700 tick for the typical drinker, a word label ("More than most" / "About average" (±6) / "Less than most").
  - "Styles you rate highest": bars by average, "4.5 · 2 tastings".
  - Recommendation cards (→ result card). With Ask on, the "Ask:" row.
- **Axis detail (24):** name 28px · summary · You vs Typical drinker (8px bars) · "The tastings behind it" with up/down arrows and reasons · "To test it" card suggesting a bottle (with Ask on: "Ask for one").

### 13. Ask (chat) and history — behind a flag, off in v1 · 32
Unchanged from v1.0; build only when the flag is on.
- Header: back · thread title · sub "Reads your palate · {n} tastings" / "Doesn't know your palate yet — tell it what you like" · new (+) · history.
- Empty: "What are you drinking with?". Messages: user right-aligned (max 78%, radius 16/16/4/16, accent-100 / accent-900); assistant plain text (max 88%); recommendation cards → bottle page; source footnote (hexagon icon, 12px neutral-700); 3-dot typing indicator.
- Suggestion chips wrap onto several rows. Composer directly above the tab bar (12px bottom padding): camera button 44px · pill input "Ask anything about sake…" · 34px send. The list fades top and bottom.
- History: thread list (icon, title, preview, age).
- The prototype's replies are canned. Production: an LLM with the journal and palate as context, subject to the "Use my palate for Ask" toggle.

### 14. Sign-in (bottom sheet) · 25
- Opens about 650ms after the first save (tasting, wishlist or cellar), or from the journal card / Account.
- Apple · Google · email. **No passwords.** Email → "Send code" (enabled once valid) → 6-digit field (56px, 24px, 0.5em tracking, centred), auto-submits at the 6th digit; "Wrong address?" · "Resend".
- Title and lead by trigger: first log "Keep this tasting" / "It's saved on this phone. Sign in so it's backed up and your palate follows you." · wishlist "Keep your wishlist" / "…and to get a note when it's in stock nearby." · cellar "Keep track of your cellar" / "…bottles and open dates are backed up." · manual "Keep your journal".
- Footer: "Not now", then the disclosure line (keep it on the sheet):
  - **EU:** "No password. Nothing is posted publicly. Your ratings stay private unless you choose to share them."
  - **Japan:** "No password. Nothing is posted publicly. Your ratings help build flavour charts anonymously — you can turn this off in Account."

### 15. Account · 26 (EU), 31 (JP)
- Signed in: avatar 52px · name 19px · "email · via Apple". Signed out: "Not signed in" card with "Your {n} tastings live only on this phone…" + "Sign in".
- Groups (rows **min 50px, may grow**; icon neutral-600; value right-aligned neutral-700):
  - **Your journal:** Backup ("Synced just now" / "Off" → sign-in) · Export journal (CSV · JSON).
  - **Display:** **Language** — value "English", sub "Deutsch — coming soon", **not tappable** until DACH launch (then a real switch) · Sake names (Romaji + kanji → Romaji only → Kanji only) · Temperature (°C / °F) · Region & drinking age.
  - **Privacy:**
    - "Use my palate for Ask" toggle (default on; row hidden with Ask off).
    - **"Contribute to flavour charts"** toggle. **EU default off, Japan default on**; one tap either way. Off: "Off · your ratings stay private". On: "Sharing anonymously — ratings and flavour words, never notes or your name". Opting out changes only what they contribute, never what they see.
    - **Cookie settings** → reopens the cookie banner in Customise (EU).
  - **Account:** Sign out ("Your journal stays on this phone") · Delete account (signed out: "Delete local data").
- **Chart opt-in card** (on Palate, §12): EU only, once, when sharing is unanswered and there are ≥3 tastings. Accent-mark heading "Help chart small breweries" · "Many sakes have no flavour chart because too few people have rated them. You can add your ratings and flavour words anonymously. Never your notes or your name." · two **equal** secondary buttons, "Keep private" · "Share anonymously". Nothing pre-ticked; it doesn't return after either answer.
- Toggle: 42×26 track, 20px knob; on accent-500 / `#1b1a19` knob; off neutral-400 / neutral-700 knob; 0.2s.
- Delete dialog: "Delete account and journal?" (signed out: "Delete everything on this phone?") · body with the tasting count and where the data is erased · "Export journal first" · "Keep it" · "Delete permanently" (accent-100 fill, accent-700 border).
- Footer: **Impressum · Terms · Privacy notice · Drink responsibly**. From any tab: avatar → Impressum is 2 taps; every scrolling screen also ends with the end-of-screen block.
- **Sign out lives only here** (its row under Account), never in a header.

### 16. Info sheets (shared pattern) · 12, 13, 38, 48 — retaken / new 1.5
The canonical pattern for **every inferred or approximate claim**: a short caveat line in 11px neutral-700, an info button whose `aria-describedby` points at the caveat, and a bottom sheet with the full explanation. Scrim `rgba(0,0,0,.55)`, 19px title, close button.
- **The ⓘ sits inline after the last word** and wraps with the text: a 20px box, `vertical-align: middle`, −4px vertical margin, its tap area padded to 44px. Never pinned to the far edge, never centred on a multi-line block. One rule for every caveat in the app.
- **Contrast:** 11px neutral-700 measures **8.1:1 on `surface`** (#bdb9b1 on #232221) and 8.9:1 on the ground — well past AA. A reading of ~4.2:1 means something else is applied (≈65% opacity on the text or an ancestor, or the text resolving to neutral-500, which is 4.4:1 on surface). Caveat text never takes opacity. No token change.
- **Serving temperatures (38):** "Serving temperatures" · "Japanese names for how warm sake is served. The degrees are typical, not exact." · six rows (40px degrees column · kanji · romaji · one-line note), e.g. "15° 涼冷え suzuhie — Cool. Aroma opens, still fresh."
- **Read by AI (48):** opened from the Read by AI badge. "An AI model read these words off your photo. It can misread a character or run two names together, so check them against the label." · "How sure it was: {85%}. Your photo is discarded once it has been read." The confidence percentage lives here.
- **Cross-beverage (12):** "How cross-beverage works" · "We keep a hand-made map from well-known whiskies, wines, beers, spirits, fortified wines and ciders onto the same six flavour axes we use for sake." · "When a sake sits close to a drink on that map, we say so. It's an estimate of flavour shape, made by people — nobody tasted this sake next to that drink." · "It only seeds your palate. Your own ratings replace it as soon as you have three."
- **Japanese terms (13):** opened from the info button next to the chart heading, caveat "Brewers' terms, translated loosely." The sheet says these are brewers' terms and the English words are approximations, not translations, then lists all six (62px English column · Japanese · romaji · one-line note): Floral 華やか hanayaka · Mellow 芳醇 hōjun · Rich 重厚 jūkō · Mild 穏やか odayaka · Dry ドライ · Light 軽快 keikai. Notes are in the prototype, e.g. "Showy, aromatic — fruit and blossom on the nose."

### 17. Flavour chart (shared component) · 09, 14 (two-tone), 16
Used on the result card and the bottle page.
- **Heading:** the first mention on a page reads **"Flavour chart (Sakenowa)"** (Sakenowa's registered trademark); later mentions just "Flavour". Info button beside it → Japanese terms (§16).
- **Axes**, canonical order everywhere: Floral, Mellow, Rich, Mild, Dry, Light. 2-column grid; label and value 11px neutral-700; bar 4px, accent-500 on neutral-200.
- **Caption / attribution:** a link, **"Powered by Sakenowa ↗ · +38 Yawaragi ratings"**, plus a "Flavour chart data" credit line with the Sakenowa link.
- **Blended bar (v1):** one value from both sources.
- **Two-tone fallback (14),** if the licence review requires the sources to be shown separately: inside the 4px bar, two 2px lines with no gap — Sakenowa accent-500 on top, Yawaragi users accent-300 below — and a one-line key under the chart (Sakenowa · Yawaragi users). The caption shortens to "Powered by Sakenowa ↗ · +38 Yawaragi".
- **No chart yet:**
  - Sharing on: "No flavour chart yet. Four Yawaragi ratings build one — yours counts, anonymously."
  - Sharing off (EU default): "No flavour chart yet. Yawaragi users build one with four ratings — you can join in Account → Privacy."
  - **Interim, until the Account → Privacy setting and open rating exist:** "No flavour chart yet." alone. Restore the full string with the setting.

## Behaviour rules
1. **The star is the save.** No Save button anywhere. Every save shows an Undo notice for **6.8s**. Undo removes the entry in one step. **Done** says "finished" without saving anything. After Undo has gone, a tasting is edited or deleted from "You and this sake" → Edit (§9); delete confirms inline.
2. **Sign-in is asked for after the first save.** The first tasting, wishlist add or cellar add opens the sign-in sheet about 650ms after the action, with copy for that trigger. The item is already stored on the phone. "Not now" silences the prompt for the session. The journal backup card remains as the quiet reminder.
3. **Local first.** Everything works without an account. Signing out never wipes the phone. The phone data must be migrated to the account on sign-in.
4. **Missing data is stated, not hidden** — for one sake. "Not published" (italic), "Best guess" matches, empty-section sentences that invite a contribution. A section that **no** sake can fill yet is hidden, and an affordance for a feature that doesn't exist is never rendered.
5. **The wishlist clears itself** when that sake is logged. "Bought it" moves it to the cellar.
6. **Menu mode has no typing.** Unmatched menu lines go to search with the text filled in.
7. **Scroll fade.** Any list that scrolls under a fixed header or control fades over 18px at that edge. Use a mask, not an overlay: `mask-image: linear-gradient(to bottom, transparent 0, #000 18px)`. Give it at least 16px of top padding so nothing fades at rest. The fade replaces a hard border; don't use both. Use a bottom fade only above borderless controls (Ask's composer). The tab bar keeps its surface and top border instead. **Horizontal rows** bleed to the screen edge and fade the trailing 32px (`mask-image: linear-gradient(to right, #000 calc(100% - 32px), transparent)`), with 48px trailing padding so the last item can scroll clear, and `scroll-snap-type: x proximity` on item starts. Every horizontal row (§9.9, Similar, search suggestions) uses this.
8. **Placeholders are always italic.**
9. **One accent tag per row.** Accent tags are for the app's own claims (match, confidence, "Tasted"); neutral tags are for facts about the sake.
10. **Phone layout.** Lock the app to the visible screen: `height: 100dvh; overflow: hidden; overscroll-behavior: none`. Only inner panes scroll; the page itself never does.
11. **Navigation.** One rule everywhere: the **top edge** is "where am I / go back", the **bottom edge** is the tab bar.
   - The tab bar is visible on every screen except the age gate; sheets cover it while open.
   - The tab you came from stays highlighted on screens you open from it; after a scan that's Scan.
   - Tapping a tab goes to its main screen and clears the history.
   - Tab main screens (Home, Scan, Collection, Palate) have no back button. Every other screen has a back arrow top-left that returns to the **previous screen**, using a history stack. The camera has no ✕; the tabs are the way out.
   - Never put a second bar on the bottom edge. Screen actions go in the content.
   - On Android the system back gesture pops the same stack. When the keyboard opens, it covers the tab bar and the Ask message box sits on the keyboard.
12. **Floating surfaces** (cookie banner, notices): `--color-raised` with `--shadow-float`; no scrim. They never look like a card of the page.
13. **Provenance.** Any displayed value from `llm_extracted`, `llm_inferred`, `cross_beverage_map` or generated text carries the ProvenanceBadge: a 24px neutral **outline** pill (1px neutral-400, neutral-700 ink, 11px, icon 12px). Kinds differ by **icon and word**, not colour: Read by AI (scan) · AI answer (magic-wand) · Cross-beverage (arrows-left-right) · AI-written (pen-nib). It never takes the accent. Tapping opens the §16 sheet for that source; confidence lives in that sheet. Tag families: accent tint = the app's claim, neutral fill = a fact, neutral outline = machine-derived. **AI-written** text (generated tasting notes, when built) starts with the badge and ends with "Improve · Report" links; the text is neutral-800, never italic.
14. **No image, no slot.** Thumbs and bottle slots render only when there is an image. Today that is only §5's photo, for the session that took it. Rows without one are text-only; no permanent striped placeholders.
15. **End-of-screen block.** Last in every scrolling app screen (not the camera, sheets or Ask): 28px above, left-aligned on the content column, 12px neutral-600. Line 1: "Catalogue and flavour data · Powered by Sakenowa ↗" (link). Line 2: Impressum · Privacy notice · Cookie settings · Drink responsibly — accent-700 links, 14px apart, 6px vertical padding, wrapping. No divider. Account shows line 2 only.

## State (per user)
- `entries[]` {id, sakeId|name, date, rating (0.5 steps), note, tags[], detail{appearance, nose, palate scales 1–5, serve, verdict, specs if manual}}
- `cellar[]` {sakeId, count, openedAt|null, nama}
- `wishlist[]` {sakeId, source {type: ask|scan|page, context}, createdAt}
- `askThreads[]` {id, title, messages[]}
- `settings` {region, nameDisplay, tempUnit, usePalateForAsk (default true), contributeToCharts (**tri-state: undefined = not yet asked**; EU: undefined → treated as false, the opt-in card shows at ≥3 entries while undefined; Japan: undefined → treated as true)}
- `auth` {signedIn, provider, email, promptSnoozedThisSession, journalCardDismissed}
- Derived: `palate` (per-axis 0–100, confidence = min(n/10, 1), top styles), rank for menu items.

## Design tokens (theme "Ginshu")
Warm-ash dark ground with a ginshu (銀朱, "silvered red") accent. Structure, spacing, radii and type come from the Nocturne design system; only the colours are overridden.

**Surfaces and text**
- bg `#1b1a19` · surface `#232221` · text `#e8e4dd` · divider `rgba(232,228,221,.14)`
- Camera/overlay ground `#121110` (fixed, below the ramp) · text on that ground `#f6f2ea`

**Neutral ramp** (counts outward from the ground)
100 `#201f1e` · 200 `#2d2b29` · 300 `#383634` · 400 `#4a4744` · 500 `#8a867e` · 600 `#a8a49c` · 700 `#bdb9b1` · 800 `#d6d2ca` · 900 `#ece8e1`

**Accent ramp**
100 `#2a201c` · 200 `#3a2a23` · 300 `#5c3b2f` · 400 `#8a5642` · **500 `#b8735a`** (marks, bars, toggles) · **600 `#cf8a6e`** (stars, outlines, selected chips, icons; brighter so it holds up at low screen brightness) · 700 `#e0a88f` (accent text) · 800 `#eec2ae` · 900 `#f6ddd1`

**Usage**
- Selected chip: 600 fill with `#1b1a19` text.
- Accent text at body size: 700.
- Muted text **on `surface`** at 11–12px: neutral-600 or lighter. Neutral-500 is for the ground only (4.8:1 there, 4.4:1 on surface).
- The accent never floods a surface. The only tinted surface is the logged panel (accent-100).
- The accent "mark": a 2px × 14px accent-500 rule before a heading, one per surface.

**Shadows**
- sm `0 0 0 1px #302e2c`
- md `0 0 0 1px #302e2c, 0 10px 26px rgba(0,0,0,.42)`
- lg `0 0 0 1px #363431, 0 18px 44px rgba(0,0,0,.55)`
- **float** `0 0 0 1px #4a4744, 0 -10px 28px rgba(0,0,0,.45), 0 18px 44px rgba(0,0,0,.55)` — floating surfaces only, with **raised** `#2d2b29` (= neutral-200).
- Scrims: sheets `rgba(0,0,0,.55)`, dialogs `.6`.

**Type**
Inter via Nocturne's `--font-heading` / `--font-body`. Headings are weight 500, never bolder.
- 36 onboarding · 34 hero · 28 axis title · 26 tab title · 25 bottle name · 24 section headline · 21 card/sheet title · 19 · 17 · 15 card heading · 14 body · 13 secondary · 12 meta · 11 section label (uppercase, 0.1em tracking) · 10 micro label

**Letter-spacing**
−0.02em at 21px and above, −0.01em at 15–19px.

**Spacing and radius**
Nocturne's `--space-*` (0.7× density) and `--radius-*` (8px base).
- Screen gutters 18–22px · touch targets at least 44px (chips 36px, list rows 48–58px).
- Radii: pills 999px, sheets 20–22px top, device 38px (desktop preview only).

**Motion**
- `yw-rise` 0.24–0.34s ease-out (translateY 14px plus fade) for cards, toasts and messages.
- `yw-fade` 0.2–0.3s for view swaps.
- `yw-sheet` 0.26–0.28s ease-out for bottom sheets.
- `yw-pop` 0.3s for stars.
- Camera frame resize 0.28s ease. Toggles 0.2s.

**Icons**
Phosphor, regular and fill weights (`@phosphor-icons/web` 2.1.1). Sizes: 22 tab · 19–20 toolbar · 17 button · 14–15 inline.

## Open decisions (log these, don't guess)
1. **Drinking ages and region detection.** The figures above are commonly cited, not legally checked.
2. **Flavour charts and contribution — DECIDED.** Our users' ratings build Yawaragi charts. Where Sakenowa has data, combine both and name both sources in the caption. Where it has none, show Yawaragi's alone once a sake has 4 ratings. The default depends on the market: **EU off** (GDPR opt-in: the one-time Palate card at the 3rd tasting, equal "Share anonymously" / "Keep private" buttons), **Japan on** (disclosed on the sign-in sheet). Both are switchable in Account → Privacy. Only ratings and flavour words are shared, never notes or identity. Community text notes ("What others noticed") stay **opt-in per note**. Full spec: Screens §15 (Privacy) and §12 (opt-in card).
3. **Data sources and licensing:** the catalogue (≈12,400 sakes in the copy), Sakenowa chart data, and shop and stock data.
4. **Cellar freshness thresholds** (10 days, or 5 for nama).
5. **Ask:** which model, what context it gets, and the fallback when offline.
6. **Tasting-notes wording:** it's modelled on professional tasting practice but must not name any certification body.
7. **Sakenowa credit placement.** Design places the above-the-fold credit as the identity block's last line (§5, §9), not first in the page. Engineering's reading of the licence (CLAUDE.md) should confirm that this satisfies "above the fold on dedicated detail pages". Wording is fixed: "Powered by Sakenowa" plus the link.
8. **Bottle-level data** (bottlings under a line): naming and behaviour answered in the appendix; the page is drawn in 1.6.

## Files in this bundle
- `Yawaragi Mobile.dc.html`: **the main prototype.** All screens, all behaviour. Logic is in the `class Component` block at the bottom. Tweaks: market, Ask, Menu scan, camera permission, iOS webview, two-tone bars, first run, **Scan outcome** (which §5a branch the next capture lands on) and **Rating live** (§12's rating slot).
- `Yawaragi Mobile (phone).html`: a self-contained single-file build of the same prototype. It opens directly on a phone.
- `Yawaragi Tokens.dc.html`: the token and component reference (colour ramps, type scale, every component specimen, behaviour rules). "Added in 1.5" holds the provenance badge, AI-written note, floating surface, caveat line, horizontal row edge, tile vs button, end-of-screen block, tab placeholder and cellar control.
- `Yawaragi Core Loop v2.dc.html`: decision record. It shows the result-card options (1a chosen), the thin-data states, and the colour exploration that led to Ginshu (turns 2–6).
- `screenshots/`: 50 reference PNGs at 390×844 (index in the Decision log; each Screens section lists its own). 1.5 retook the changed ones and added 34–50.
- `Yawaragi Landing.dc.html`: the public landing page, outside the app shell.
- `Yawaragi Account.dc.html`: decision record. It shows the sign-in timing options (1a chosen) and the account screen spec (1c).
- `support.js`: the prototype runtime (needed only to open the `.dc.html` files; don't port it).
- `_ds/…`: the Nocturne design-system stylesheet and bundle the prototypes load.

## Decision log (why, not what)
**The numbered Screens sections above are the spec.** This log only records the reasons behind decisions made after v1.0, so the Screens text doesn't have to argue for itself.

- **Cross-beverage restored (v1.1).** Dropping it in v1.0 was a side effect of choosing result card 1a, not a decision. It's the cheapest cold start: no model call and no three-tastings wait. → §5, §12, §16.
- **Ask off in v1 (v1.1).** Cost and a 12.8s median response. Similar sakes became a deterministic list; "What goes with it" became a static pairing block. → §3, §6, §9, §13.
- **EU compliance (v1.1).** Cookie banner (GDPR: equal buttons, nothing pre-ticked, easy withdrawal); DACH age-gate chips with a law line (JMStV §6(5)); chart sharing is opt-in in the EU. → §1, §2, §15, §17.
- **Sakenowa (v1.1).** "Flavour chart" is Sakenowa's trademark and their licence is attribution-based; hence the heading, the linked caption and the two-tone fallback. → §17.
- **Japanese terms disclosed (v1.1).** The six axes are brewers' terms with no exact English equivalent. → §16.
- **Axis order (v1.1).** Sakenowa's order is canonical everywhere, so the chart and Palate agree. → §12, §17.
- **German length (v1.1).** May grow: camera hint (to 3 lines), Palate axis rows, notes headers, Account rows. Wrap: rating band word below the stars, menu reason 2 lines then clamp, tags. **Hard limits — flag back to design:** tab labels (10px, one line, ~11 characters), the camera's top row and shutter row, segmented controls; these may drop to 12px once, then must be flagged.
- **Landing first (v1.2).** It's today's entry route and a legal-link home. → §0.
- **German is "coming soon" (v1.2, your ADR-0008).** `/de/` renders a coming-soon page until the Impressum is in place. → §0, §1, §15.
- **Tab bar everywhere (v1.3).** The bottom edge used to switch between tabs, nothing and action bars. One rule now: top edge for where you are and back, bottom edge for tabs. → rule 11, §4, §9.

- **Scan outcomes (v1.5).** The pipeline's tiers (ADR-0015) produce more outcomes than v1.4 drew, and roughly half of real scans land outside the happy path. One shared screen with a read card, candidates and a keep-it-anyway exit beats ten layouts, and the top-bar rescan replaces five inline buttons. → §4, §5, §5a.
- **Provenance as outline (v1.5).** The accent means "you are here / primary"; colour-coding four sources would need four hues the warm ramp doesn't have and would fail for colour-blind users anyway. Outline + icon + word stays legible and quiet. → rule 13.
- **Floating surface (v1.5).** On the dark ground a surface-coloured overlay is indistinguishable from the cards scrolling under it; one raised step and an upward shade separate it without a scrim. → rule 12, §0, §2.
- **No placeholders for images we will never have (v1.5).** Sakenowa returns no images; five striped boxes per list read as broken. → rule 14.

### Open items
- **Landing page:** the hero needs a real app screenshot.
- **German copy:** not written; the DE switches only show "coming soon".
- **Legal wording:** Austria/Switzerland gate lines and the cookie category descriptions.

### Screenshots
`screenshots/` holds 50 PNGs at 390×844 (1×), captured from the prototype.
- **01–26 are the base: EU (Germany), Ask off, Label only.**
- **27–32 are the variants where Japan or Ask-on differ.**
- **33 is Menu scan** (deferred).
- **34–50 are new in 1.5.** Retaken in 1.5: 02–06, 09–23, 25, 26, 28–31 (marked ●).

| # | Screen |
|---|---|
| 01 | Age gate (Germany, law line) |
| 02 | Cookie banner over Home ● |
| 03 | Cookie banner, Customise ● |
| 04 | Home ● |
| 05 | Home, first run ● |
| 06 | Camera, label ● |
| 07 | Camera, permission denied |
| 08 | Camera, desktop / no camera |
| 09 | Result, before rating ● |
| 10 | Result, logged ● |
| 11 | Detailed notes sheet ● |
| 12 | Cross-beverage explanation sheet ● |
| 13 | Japanese flavour terms sheet ● |
| 14 | Two-tone bars fallback ● |
| 15 | Similar sakes ● |
| 16 | Bottle page, well documented ● |
| 17 | Bottle page, little published ● |
| 18 | Search ● |
| 19 | Journal ● |
| 20 | Cellar ● |
| 21 | Wishlist ● |
| 22 | Palate, with chart opt-in card ● |
| 23 | Palate, early (1 tasting) ● |
| 24 | Flavour detail (Rich) |
| 25 | Sign-in sheet after first log ● |
| 26 | Account (EU, sharing off) ● |
| 27 | JP: age gate (20) |
| 28 | JP + Ask: Home, three tiles ● |
| 29 | JP + Ask: Result with "What goes with it" ● |
| 30 | JP + Ask: Palate, no opt-in card ● |
| 31 | JP: Account, sharing on ● |
| 32 | Ask chat |
| 33 | Menu results (deferred) |
| 34 | Result, logged, after Done (folded line) |
| 35 | Bottle page, rating panel open in place |
| 36 | Bottle page, "In cellar · 2 ›" + "+" |
| 37 | Bottle page, editing an earlier tasting, delete confirmation |
| 38 | Detailed notes, How you had it, Serving temperatures sheet |
| 39 | Palate early (1 tasting), Lagavulin 16 picked |
| 40 | Result, Best guess, candidates open |
| 41 | Scan outcome: brand only |
| 42 | Scan outcome: brewery only |
| 43 | Scan outcome: several fit |
| 44 | Scan outcome: not in the catalogue |
| 45 | Scan outcome: unclear, recent scans agree |
| 46 | Scan outcome: unclear, nothing read |
| 47 | Scan outcome: rate limited |
| 48 | Read by AI sheet over 44 |
| 49 | Scan outcome: something went wrong |
| 50 | Palate early, 0 tastings, rating not live (today's build) |

Screenshots that sit in sheets or overlays show the full screen behind them with the scrim.

To regenerate after a design change: the prototype exposes a dev-only capture hook (`window.__yw`, `window.__ywShot`, `window.__ywProps`). Don't port it.

---

## v1.5 · Answers to the engineering hand-back on v1.4
Everything below is already folded into the Screens sections and the prototype; this is the index, so you can tick items off. "Accept" means keep what you built; it is now spec.

### Part A — verdicts
- **§5 Quick chips fit the bottle** — **Accept.** Rules in §5 (and #367 below).
- **§5 Undo 6.8s** — **Accept.** Not "until the next interaction": a notice that never leaves would sit over content. Rule 1.
- **§5 Undo in one step, panel dims** — **Accept** (0.2s at 45%).
- **§5 "Done"** — **Accept, drawn** (34, 35): accent-outline button beside "Add detailed notes"; folds on the result card, closes on the bottle page.
- **§5 "Delete tasting" with inline confirmation** — **Accept, drawn** (37), and the copy now names the sake and date (#286's requirement). No dialog: the panel is already the focused surface.
- **§5 Heading "Logged"** — **Accept.**
- **§9 "Rate a new tasting" opens the panel in place** — **Accept, redrawn** (35): the panel takes the row; under it Similar · cellar control · wishlist icon.
- **§9 Wishlist and cellar not header icons** — **Accept.** The header is back · name; both live in the action rows.
- **§9 Cellar control link + "+"** — **Accept, drawn** (36) as one split outline. Same control on the result card.
- **§9 "Edit" on You and this sake** — **Accept** (37).
- **§10 "Tasted on"** — **Accept** at the top of the sheet. Not in the panel's meta line; no "moved" mark in the journal.
- **§10 Opens on Appearance** — **Accept.**
- **§10 Six temperatures + info sheet** — **Accept** (38). Chips read romaji then degrees, "suzuhie 15°".
- **§10 "About the sake" not built** — **Accept** until manual entry ships.
- **§11 Journal and Cellar only** — **Accept.** Wishlist's segment appears when it ships.
- **§11 "Full notes" chip** — **Accept.**
- **§11 Cellar "Remove one"** — **Accept.**
- **§11 No brewery, no nama on cellar rows** — **Accept** while unstored.
- **§11 Latin first, kanji under** — **Accept**, and applied to Home's recent rows too (it matches the default "Romaji + kanji" setting).
- **§2 Banner one step lighter, upward shadow** — **Accept, formalised** as the floating surface (rule 12, tokens `raised` / `float`), and applied to notices and the landing banner.
- **§2 Page scrolls clear of the banner** — **Accept.**
- **End of every app screen** — **Redrawn** as the end-of-screen block (rule 15).
- **§8 Label-name search** — **Accept.**

### Part B — answers
1. **ProvenanceBadge.** The kinds **stay distinct, by icon and word**, not colour (rule 13). There is no room in the warm ramp for three extra hues, and any hue would compete with the accent. Machine-derived reads as a **neutral outline** — the third tag family. The **confidence leaves the chip**: on a match it is expressed as "Sure match" / "Best guess"; the number is in the Read by AI sheet (48).
2. **"AI-written"** — the fourth kind, designed now: pen-nib badge first, "Improve · Report" after the text, text neutral-800 and never italic. Specimen in Tokens.
3. **TabPlaceholder** — **confirmed as built**: one surface card, accent mark, title, one line, no illustration, no button. Specimen in Tokens.
4. **§16 caveat contrast** — no token change: 11px neutral-700 on `surface` is **8.1:1** (computed with WCAG's formula from the two values you quoted). 4.22 matches that text at ~65% opacity, or neutral-500 (4.4:1). Please look for an `opacity` / `/65` utility on the caveat or an ancestor. Rule added: caveat text never takes opacity; neutral-500 is never small text on `surface`. Same answer for §17's axis labels.
5. **§0 feature cards** — **icon on the title's row at every width**, gap 10px, title centred on the icon; body 8px below. Landing updated.
6. **§6 cosine vs L2** — "cosine" was shorthand. **The sentence changes, not the metric**: §6 now says Euclidean (L2), and the prototype ranks that way.
7. **§6 thumb** — **comes out**, of §6 and of every row without an image source (rule 14). If importer photography arrives, the thumb returns only where there is a real image.
8. **SakenowaAttribution** — keep a separate above-the-fold credit on the bottle page; §17's caption alone sits too low there. Treatment: **no box, no fill, no border**, a single 11px neutral-700 line, "Catalogue data · Powered by Sakenowa ↗", on the column at the gutter. It is the **last line of the identity block**, not first in the DOM: still above the fold at 390×844, and no longer ahead of the sake's name. The scan card carries the same line. Please confirm with your licence reading (Open decisions 7).
9. **Scan branches** — **extend the model**; see §5a. One shared vocabulary (top bar, status block, read card, candidate rows, keep-it-anyway). The ghost **"Scan again" in the top bar generalises** and replaces every inline button, including the one under the matched card. It **goes to the camera screen (§4) on every device**, never straight to the photo library. Message-only states get the status-block treatment.
10. **Landing banner shadow** — an artefact. The landing uses the floating surface like §2, and "same rules as §2" stays true.

### Follow-ups
- **Horizontal chip rows** — trailing 32px mask fade, 48px trailing padding, snap to item starts. Rule 7.
- **§17 empty chart, EU** — **Accept** the interim "No flavour chart yet." Hiding sections no bottle can fill: **accept** (rule 4).
- **§16 ⓘ alignment** — **inline after the last word, wrapping with the text.** On #341: no objection to removing the transliteration caveat; if it stays, it follows the same rule.
- **"Scan again" under the result card** — drop it; the top bar is the answer, and the result screen gets its own bar (App structure → Headers).
- **§4 frame hint / landing copy** — **Accept** without barcode; "or type the name" returns with §8.
- **§12 early screen** — **redrawn** (23, 39, 50). Leads with the drink chips, which turn into a starting sketch. The caveat sits inside the chip card, and the attribution is folded into the "Sakes to try next" label row. Three richer cards replace six bare rows. The rating slot is absent until rating ships. The header pattern (title + one meta line) is the one for §3 and §11 too.
- **Header without Sign out** — **Accept**. EN/DE stays until `de` launches. The signed-in cue is the avatar's initial on accent-200 (App structure).
- **§3 tiles vs buttons** — tiles are **filled surfaces, left-aligned, icon top-left**; buttons are outlines, centred. **First run never shows the tile row**, even when "Type it" returns; the card has "Scan a label" + ghost "Or type the name".
- **Journal edit/delete (#286)** — in the panel, reached from §9.3 "Edit". The journal row opens the bottle page; "Full notes" opens §10. Delete confirms inline and names the sake. The panel also edits rating and chips; widening the action beyond notes is your call.
- **Undo 6.8s** — accepted (above).
- **Quick chips (#367)** — 1: a memory aid. 2: they don't feed the TasteProfile; a confirm/dispute-the-axes control is a separate design. 3: the sake's own axes. 4: five. 5: Chilled / Warm / With food stay; §10 holds the detail. 6: axis chips only where the chart and its caveat are on screen. 7: recorded in §5.
- **Collection first segment (#369)** — **option 1, remember the last segment**; a new visitor gets Journal.
- **Cellar "In cellar · 2" / §9 action row with the panel open** — accepted and drawn (35, 36).
- **Overlay over content (#368)** — floating surface (rule 12): raised token + float shadow, no scrim. It serves the Undo / View notices too.
- **End of an app screen** — the end-of-screen block (rule 15). The legal links **stay on app screens**: it keeps the Impressum one tap from any scrolling screen ("unmittelbar erreichbar"), and the block is quiet enough to carry it.
- **A tasting's date (#352)** — top of §10 stays; no journal mark.
- **Done / Appearance / temperatures (#352)** — accepted (above).

### B-Line — the bottle vs the line (answered in writing; drawn in 1.6)
1. **Naming.**

   | concept | glossary | UI (EN) | UI (DE) |
   |---|---|---|---|
   | Sakenowa "brand" (李白) | Line | **sake** | Sake |
   | a specific bottling (Wandering Poet, JG, Yamada Nishiki 55%) | Expression (code) | **bottling** | Abfüllung |
   | a physical bottle you own | Bottle | **bottle** | Flasche |
   | a journal entry | Tasting | **tasting** | Verkostung |

   "This sake" always means the line, "this bottling" the expression, and "bottle" appears only for things you own (Cellar, "Add to cellar"). Page titles carry the most specific name known. A bottling's page shows, under its name, "A bottling of {line} ›" linking to the line page. Back links are always "back" (no label). Search rows say "Bottling · 李白" or "Sake · 3 bottlings" in the meta line. Journal and Cellar rows lead with the bottling name when known ("Rihaku Wandering Poet"), the line's kanji under it.
2. **The bottling page** — one template, §9's order, with sections dropping out:
   - Identity: product name, line name (linked), grade tag, flag tags (Nama, Genshu, Sparkling, Koshu · {n} years), all neutral.
   - "The sake" grid extends to: Grade, Rice, Polishing, Starter, Yeast, ABV, SMV, Acidity, Size(s), and Cask / Age when known. The first six always show ("Not published" in italics); the rest only when known. Each value's source sits under the grid as one 11px line ("Label · importer page"); a value read from a scan carries the Read by AI badge.
   - **"About the {李白} line"**: one titled block holding the flavour chart, Similar and any ranking, with the caveat "Measured for the whole line; bottlings vary." + ⓘ. Nothing line-level sits outside it.
   - "Other bottlings in this line": a horizontal row (rule 7) above that block.
   - Bottling + line known: everything. Line only: today's page plus "Bottlings we know" and "Add your bottling". Bottling only (no line): no "About the line" block, so no chart and no Similar; "Not in the catalogue yet" stated once (rule 4).
3. **Finding a bottling.** Search is mixed and ranked by match; on a tie bottlings come first. Scan → a known bottling opens its §5 card. Line only → the §5 card, plus "Is it one of these bottlings?" (candidate rows, §5a) and "Add this bottling". Nothing → §5a "Not in the catalogue". "Add this bottle" asks only for the name (prefilled); brewery, grade and size are optional, and everything else goes in §10 "About the sake" later.
4. **Rating and keeping.** A bottling's tasting counts toward its line, and the line page's "You and this sake" lists it with the bottling name. The Palate **uses the line's chart as an approximation and says so** once, on the axis detail ("Some tastings use their line's chart"). Cellar rows show size in the count line ("× 2 · 720 ml"); nama freshness waits for the threshold (OPEN 4).
5. **Public vs private.** **Private until accounts open.** An unmatched or added bottling shows only to its author, as "Your own entry" with the line "Only you can see it." No public treatment is needed yet.

---

## Changelog
### 1.5 · 10 Oct 2026
Engineering hand-back on v1.4: every Part A item accepted or redrawn, every Part B question answered (appendix "v1.5 · Answers"). 26 screenshots retaken, 17 added (34–50).
- **App structure** — header rule (no Sign out; per-screen bars on result/outcome), avatar signed-in cue, end-of-screen block.
- **§0** — feature-card icon on the title row at every width; Identify copy without barcode; banner uses the floating surface.
- **§2** — banner is a floating surface (`raised` + `shadow-float`); pane scrolls clear of it.
- **§3** — tiles redrawn as filled surfaces (icon top-left); no tile row on first run; card gains "Or type the name"; recent rows Latin + kanji, no thumb.
- **§4** — hint "Kanji or romaji — whichever the bottle gives you."; every rescan lands on the camera screen.
- **§5** — match tag ("Sure match" / "Best guess") with inline candidates; photo slot only for the session's capture; Sakenowa credit line in the identity; no provenance badge on the matched card; heading "Logged"; Undo 6.8s in one step; quick chips from the sake's two strongest axes + Chilled · Warm · With food; Done (folds to one line); Delete tasting with inline confirmation; Cross-beverage badge and inline ⓘ; shelf row with the cellar control; "Add a label photo" removed.
- **§5a (new)** — scan outcomes: one shared layout for brand-only, brewery-only, several-fit, not-in-catalogue, recent-scans consensus, unreadable and message-only states; top-bar "Scan again" replaces inline buttons; editable "What we read"; "Keep it anyway".
- **§6** — L2 (Euclidean) wording and ranking; rows text-only.
- **§8** — rows text-only; label-name matching noted.
- **§9** — header back · name only; identity text-only with the Sakenowa credit line; action rows with the panel opening in place; cellar control split ("In cellar · n ›" | "+"); "Edit" on You and this sake; brewery row uses the horizontal-row edge; unfillable sections hidden; end block.
- **§10** — "Tasted on" at the top; opens on Appearance; six temperatures (adds suzuhie 15°) with the Serving temperatures sheet; "About the sake" waits for manual entry.
- **§11** — Wishlist segment hidden until built; opens on the last segment; Latin + kanji rows; "Full notes" opens §10; cellar rows text-only, "Remove one".
- **§12** — early screen redesigned: title + one meta line, rating slot only when rating is live, drink chips lead and become a starting sketch, caveat inside the card, attribution in the "Sakes to try next" label row, three richer cards; tip card and its button removed.
- **§15** — Sign out lives only here.
- **§16** — ⓘ inline after the last word; contrast answer (8.1:1, no change); Serving temperatures and Read by AI sheets.
- **§17** — interim EU empty-chart copy.
- **Behaviour rules** — 1 (6.8s, Done, edit/delete), 4 (hide unfillable sections), 7 (horizontal-row edge), new 12 floating surfaces, 13 provenance badge, 14 no image no slot, 15 end-of-screen block.
- **Tokens** — `--color-raised`, `--shadow-float`; muted-text-on-surface rule.
- **Open decisions** — 7 credit placement (licence check), 8 bottle-level data.
- **Files** — Tokens "Added in 1.5"; Landing updated; prototype tweaks Scan outcome and Rating live.

### 1.4 · 26 Sep 2026
**Screens rewritten as the single spec.** All v1.1–v1.3 changes are folded into the numbered Screens sections, and new sections cover the landing page (§0), cookie banner (§2), Similar sakes (§6), info sheets (§16) and the flavour chart component (§17). Each section lists its screenshots. The v1.1/v1.2 answer appendices are replaced by a short Decision log. Fixes: the camera has no ✕ (the old v1.1 answer on Label-only scanning said it did); the camera title and "Type it" no longer wrap — the top row is now a 44px · 1fr · 44px grid, and screenshots 06–08 are retaken.

### 1.3.1 · 26 Sep 2026
README fixes only, no design change. Chart-contribution default corrected in three stale places (Open decisions §2, the Account spec, State): **EU off, Japan on**, stored tri-state. Behaviour rules renumbered so 10 is Phone layout and 11 is Navigation. Added the rule "prototype wins over README".

### 1.3 · 26 Sep 2026
Navigation: the tab bar is now on every screen except the age gate, including the camera, results, detail screens and the Ask chat. The camera loses its ✕. The bottle page's sticky bottom bar is replaced by an action row under the identity block. Rule 11 is rewritten. All 33 screenshots are retaken.

### 1.2 · 26 Sep 2026
Landing moves into the port MR, with a standalone footer spec. Cookie banner also on the landing; one consent covers both surfaces. DE marked "coming soon" in Account, gate and landing. 33 reference screenshots (base plus Japan/Ask variants). Back buttons return to the previous screen (navigation rule 11). The desktop preview frame fits the window.

### 1.1 · 26 Sep 2026
Answers to the 14 engineering questions (see "v1.1" section). EU market mode, cookie banner, DACH age gate with law line, locale switch, legal links, chart opt-in (EU off), Sakenowa trademark and attribution, Japanese axis terms, two-tone fallback, canonical axis order, cross-beverage cold start, Ask-off flows (two-tile Home, Similar list, pairing block), camera fallbacks, Label-only scan.

### 1.0 · 25 Sep 2026
First full handoff. All screens, behaviour rules, Ginshu tokens. Decided: result-card rating saves (1a), sign-in after first save, chart contribution on by default.
