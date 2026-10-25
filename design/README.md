# Handoff: Yawaragi mobile app (webview)

**Design version 1.10 · 25 Oct 2026.** Source of truth is the Claude Design project; this folder is a snapshot. When a new version arrives, read the Changelog at the bottom first and implement only what changed. **If this README and the prototype disagree, the prototype wins** — and please report the mismatch.

## Overview
Yawaragi (和らぎ) is a sake companion app. You scan a bottle label (or a menu or a shop shelf, to rank what's on it), rate the sake with one tap, and build a journal. That journal also feeds a taste profile ("Palate") and a chat assistant ("Ask"). The main job is **identifying and assessing a sake at the table**. Logging is a side effect of rating.

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
- **Sample collection (1.8, L3; 106–107).** A persistent strip under the status bar on every screen while it is open: Phosphor `books` 16px accent-700 · "**A sample collection** · Made-up tastings of real sakes. Nothing here is saved." 12px neutral-800 · secondary "Leave" 36px. Ground neutral-200, a 1px divider under it; not dismissable. Everything is read-only; starting a scan or any save leaves the sample first, so nothing mixes. Leave returns to the empty Collection.
- **Tab bar** (4 tabs, fixed at the bottom): Home · Scan · Collection · Palate. It is on **every screen except the age gate**, including the camera, results, detail screens and Ask. Sheets cover it while open. See rule 11.
- **Account** opens from the avatar at the top right of Home, Collection and Palate.
- **Camera:** one mode. There is **no Label / Menu toggle** (removed in 1.7): the read itself tells a label from a menu, a shelf, two bottles, another drink or a side with no text, and §5a says which. Ranking a menu or shelf (§7) is offered from there, signed-in only.
- **Ask** is behind a flag and **off in v1**. When it's on, you reach it from a third Home tile, the Palate "Ask:" row, the result card's "What goes with it", and the Palate hints. Every Ask entry point is hidden when it's off; nothing links to it.
- **Market** (EU / Japan) changes the age gate, the cookie banner, and the chart-sharing default. **EU is the v1 ship.**
- **The landing page** is a separate, normally scrolling page outside the app shell.
- **Headers.** Tab main screens: title · avatar at the right (plus the interim EN/DE pair until `de` launches, ADR-0007). **Never Sign out** — it lives only on §15. Every other screen has its own top bar: back · title or kicker · at most one ghost action. Result and scan-outcome screens use their own bar, not the shared shell header.
- **Avatar** (36px circle), everywhere it appears: signed in = the initial on accent-200 in accent-800; signed out = person icon on neutral-200. That difference is the signed-in cue.
- **End of screen.** Every scrolling app screen ends with the same block (see "End-of-screen block" under Behaviour rules).

### Views
`gate` (age) → [cookie banner, EU] → `home` · `scan` → `result` | `outcome` (§5a) → `menu` (§7, menu or shelf ranking) · `search` · `similar` · `sake` (bottle page, one per sake = line) → `bottling` (§9a) · `guide` → `guideEntry` (§18) · `collection` (journal / cellar / wishlist) · `palate` → `axis` (flavour detail) · `account` · `ask` → `askHistory` (flagged).
Overlays: detailed-notes sheet, sign-in sheet, info sheets (cross-beverage, Japanese terms, serving temperatures, Read by AI, whole-line measure), cookie banner, notice (toast), delete dialog.

### Screenshot key
Each screen below lists its reference screenshots (`screenshots/NN-*.png`, 390×844). Unless marked **JP** or **Ask on**, they show the v1 ship: EU, Ask off, Label only.

---

## Screens

### 0. Landing page (outside the app) · `Yawaragi Landing.dc.html`
**1.8 (K, L3):** the hero phone becomes a short loop (storyboard in appendix "v1.8", K); a secondary text link under the hero CTA, "Or look through a sample collection", opens the app in sample mode through the age gate.
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
**1.8 (J, L2, R; 94–96):** title "Fill the frame with one label" (a guide only; nothing is read live). **First three scans:** the "How to read a label" link is replaced by three shape cards (酒 "Name · front", 15% "Details · back", Aa "Importer · back"; 1px rgba(246,242,234,.18) ring, radius 8) and the link "Which side to photograph", which opens its sheet (drawing of front and back with the three parts numbered, the characters 精米歩合 / アルコール分 / % as shapes, then "How to read a label"). From the fourth scan the link returns. **Paired photo:** a pill at the top of the viewfinder, Phosphor `link-simple` · "This photo is read together with your last one" · underlined "Don't" (DE "Nicht"); the title and hint follow the part asked for ("Frame the small label with numbers" / "Usually on the back: small print, a % sign and a date."). **Photo-only mode** (from "Add a photo" / "Replace"): title "Photograph your bottle", hint "Just a photo. Nothing is read, and it doesn't use a scan."; the shutter saves and returns to the page.
- Ground is a fixed `#121110`. **The tab bar is shown**, with Scan active. **There is no ✕** — the tabs are the way out.
- **Top row:** a 3-column grid, `44px minmax(0,1fr) 44px`, padding 12px 14px, everything centred:
  - Left: empty 44px slot.
  - Centre: "Scan a label", 15px/500, `#f6f2ea`, **one line** (nowrap, ellipsis as a last resort). Always; the Label / Menu control is gone (1.7). Menus and shelves are recognised after capture (§5a).
  - Right: light toggle (lightning icon). On = frame fill brightens from `rgba(255,255,255,.04)` to `rgba(255,240,225,.14)`. **iOS WKWebView: hide it; the 44px slot stays** so the title doesn't move.
- **Frame:** 212×292. Corner brackets 30px, 2px accent-600, radius 10. While reading, an accent band sweeps top to bottom (`yw-sweep`, 1.5s, repeating).
- **Hint under the frame:** min-height 58px (may grow to 3 lines for German). 16px/500 title, 12px/1.45 hint, `text-wrap: balance`.
  - "Frame the bottle label" / "Kanji or romaji — whichever the bottle gives you." (Barcode returns with #342.)
  - Working: "Reading the label…" / "Matching against 12,400 catalogued sakes".
- **Bottom controls:** a `1fr auto 1fr` grid so the shutter is always centred. Left: "Type it" (12px, keyboard icon, **nowrap**; Label mode only, slot stays). Centre: shutter (66px ring, 52px accent fill). Right: gallery button.
- Capture → about 2s working → Result.
- **Permission denied** (07): the frame area becomes a left-aligned panel — camera-slash icon 32px · "Camera is off" 21px · "Yawaragi needs the camera to read labels. You can allow it, or use a photo you already have." · secondary "Allow camera" · **primary "Choose a photo"** · ghost "Type the name instead". Buttons 46/46/44px.
- **Desktop or no camera** (08): desktop icon · "No camera here" · "Add a photo of the label instead — from your files or a screenshot — or type the name." · dashed drop zone (140px, "Drop a label photo here, or click to choose") · ghost "Type the name instead".
- **The gallery is a complete fallback**: same pipeline as the camera.
- **"How to read a label"** (12px, underlined, under the hint; hidden while reading) → §18's label entry. (retaken 06, 1.6)
- **Every "scan again" lands here** — this screen, with the live camera — on every device. It never opens the photo library directly; the gallery button on this screen does that.

### 5. Result card (the core screen) · 09, 10, 29 (Ask on), 34 (Done), 40 (best guess), 54–55 (line only), 65 (own entry), 83–87 (1.7)
**1.8 (I, J, L1; 92, 93, 110):** under the identity block, full width, in this order:
- **"This bottle"** (L1, 93) when the label names a bottling none of the visitor's own fits: label 11px uppercase, two radio rows 48px+ (radius-md, 1px divider; selected accent-500 border on accent-100): "{composed name}" / "The bottling on this label. Added to your bottlings when you rate it or add it to your cellar." (default) and "{line}, any bottling" / "The tasting goes on the sake's page." It replaces the dashed "Add this bottling" in this state; catalogue rows under "Is it one of these bottlings?" stay. "Add to cellar" starts on nama when the label says nama.
- **"Keep this photo with the bottle"** (I1, 92): only where the rating panel shows, to a visitor who can keep a journal (signed in); hidden otherwise (rule 4). Checkbox row 44px+, unticked, behind a hairline. Sub "Only you see it. Location data is removed first, and you can delete it any time." Ticked: box accent-600 with check, label "Photo kept with {name}", sub "It shows on its page and in your journal and cellar. Untick to discard it.", the thumbnail gains a 1.5px accent ring and a pin mark. It follows the "This bottle" choice. No dialog.
- **One nudge, outside the card** (J, R3), directly under it, above everything else: 1px divider box, icon 18px neutral-600, text 13px, secondary button 36px with `camera-plus`. Matched with no bottling detail → "The small label with numbers says which bottling this is." + "Scan it". Best guess → "The name is often printed plainly on the side or on the importer's sticker." + "Scan the side" (110). The button opens the camera paired. Signed out with one free scan left: note "Uses your last free scan for the next 24 hours." 11px (DE "Nutzt deinen letzten kostenlosen Scan für die nächsten 24 Stunden."); with none left: no nudge. Never more than one.
**1.7 additions (bottling read off the label, D; brewery cue, F):**
- **"On this label"** (83): when the read found more than the line's name, the identity block gains a block under the tags, above the credit: hairline divider · label 11px uppercase "On this label" with the **Read by AI** badge at the right (→ the §16 Read by AI sheet) · one line 13px neutral-800: product as printed · grade · up to two styles · "{n}% polished" ("雄町 · Junmai Ginjō · Nama · 50% polished"). This is model-read text, so the badge rule applies; the rest of the card stays catalogue data.
- **"Add this bottling" shows whenever the label says more than the line's name** — even with no known bottlings (replaces 1.6.1's "no section"). Without bottlings it is the dashed row alone, no heading; its sub reads "Starts from what the label says".
- **The suggested name** = line name (Latin) · product name **romanised, with the kanji in brackets** · grade · up to two style words: "Rihaku Omachi (雄町) Junmai Ginjō Nama". No romanisation available → the kanji alone in brackets. The visitor confirms or edits it.
- **The naming form (84)** gains three optional fields, prefilled from the read: **Grade** · **Polishing** (one row, 1.4fr / 1fr) · **Style** (comma-separated). Hint: "Read from the label. Fix anything misread; size and the rest can wait for Detailed notes. Only you can see it." Opened from §9 (no label): fields empty, hint "Grade, style and polishing are optional; …". **Grade, styles and polishing are now fields of a bottling** (`grade`, `styles[]`, `polishingPct`); grade and style tags on the card and on §9a come from them, so guide links and "Sakes of this style" have something to work on.
- **When one of the visitor's bottlings fits the label** (grade and styles match the read), the scan **opens that bottling's card directly** (85): kicker "Your own entry · fits this label", the "On this label" block, then a 44px row "Not this bottling? All {line} bottlings ›" → the line's card with the list. In the list, the fitting row comes first ("Your own entry · fits this label" / "Fits this label · …").
- **"Brewery not on this label"** (86, F): when the label printed the brand alone and the brewery came from the catalogue, a quiet 12px neutral-700 button with an ⓘ sits under the brewery line → the Read by AI sheet (87), which gains a first paragraph: "**Brewery not on this label.** The label printed the name alone. The brewery shown is the one the catalogue lists for that name, not one we read, and two breweries can use the same name. If the back label names another brewery, tap "Not this one"." The match tag is unchanged ("Sure match" stays "Sure match").
- **Craft sake** (hops, fruit, barley koji) is sake to Yawaragi: a regular match, with a **"Craft sake"** neutral tag (book icon → §18 "Sake and the other Japanese drinks").

Top bar: back (to the previous screen) · kicker ("Matched from your photo" / "From the catalogue" / "Your own entry") · ghost "Not this one" (to the camera, §4). The bar replaces the shared header on this screen. **There is no "Scan again" button under the card**: the top bar is the rescan, and the Scan tab is the bottom-edge equivalent.

Card: surface, radius-lg, shadow-md.
- **Identity:** photo slot 92×122 **only when matched from a photo, showing that session's capture**; otherwise the slot collapses and the text takes the width (rule 14). Name 21px/500 −0.02em, kanji 13px, brewery 12px. Tags: **the match tag first** (accent, the one accent tag): "Sure match" (confidence ≥ 0.85) or "Best guess" (0.60–0.84, ADR-0015), then type tags (neutral) — **only for a bottling**; a sake (line) has no grade or style from Sakenowa, so a line's card carries the match tag alone. **A grade or style tag with a guide entry is a button** (book icon 11px after the word, 44px tap area) → that §18 entry; tags without one stay plain. **A bottling** adds "A bottling of {line} {kanji} ›" (13px accent-700) under the brewery → the line's page. Last line: **credit "Catalogue data · Powered by Sakenowa ↗"**, 11px neutral-700, link underlined in neutral-500 (§17's caption style). Hidden for your own entries.
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
- **Best guess** (0.60–0.84): under the card (above the chart), a 44px row "Not sure? {n} other candidate(s)" (list icon, caret), folded by default, expands an inline list of candidate rows (§5a) in place. No separate screen. Source: the nearest-sake lookup of §5a's "Did you mean" with the matched sake left out, up to 3; no row when there are none; never on a Sure match.
- **Line only** (the scan matched the sake, not a bottling). **At launch every scan is this, and with no known bottlings the card is exactly v1.5's (09)** — no section, no "Add this bottling"; adding a bottling lives on §9. **When the line has bottlings** — catalogue ones, or the visitor's own — (54): under the card, "Is it one of these bottlings?" · lead "We matched the sake, not the exact bottling. Pick yours and the tasting lands on its page." · candidate rows (§5a style; the reason is grade · flags · polishing; own bottlings read "Your own entry") → that bottling's §5 card · dashed **"Add this bottling"** ("Just the name — the rest can wait"). It opens in place (55): "Bottling name" field prefilled with the line name · "Brewery, grade and size are optional — add them later in Detailed notes. Only you can see it." · primary "Add bottling" · ghost "Cancel". Saving switches the card to that own bottling ("Your own entry").
- **A bottling's chart is its line's.** The caveat under the heading adds "Measured for the whole {line} line; bottlings vary."
- **Below the card:**
  - **Flavour chart** — the shared component, §17.
  - **Cross-beverage line** under the chart: "Interesting if you like Lagavulin 16" (13px/500) + the **Cross-beverage** provenance badge + caveat "Cross-beverage estimate, not a tasting note." (11px neutral-700) with the ⓘ inline after it (§16), opening the explanation sheet.
  - **"Similar sakes"** button → §6. With Ask on, also "What goes with it" (opens Ask with the question sent).
  - "Full bottle page" row (book icon, caret); "Bottling page" for a bottling.
  - **Shelf row** (44px, 8px gap): the **cellar control** (see §9) · "Wishlist" / "On wishlist" (filled bookmark, accent-700).
  - The end-of-screen block.
- **Added by you** (not in the catalogue — an **own bottling**, see §9a; 65): chart, cross-beverage and similar are replaced by a dashed card "Added by you" / "Not in the catalogue yet, so there's no flavour chart." + **only when it has a line:** " It counts toward your palate through its sake's chart." + " We'll link it if the sake turns up later. Only you can see it." · ghost "Open its page ›" → its §9a page. An own bottling with `line: null` has no axes and **does not feed the palate**. The end-of-screen block drops its line 1 (rule 15). No "Add a label photo" — photos are discarded after reading.

### 5a. Scan outcomes · 41–49 (retaken 1.6), 71–75 (1.7)
**1.8 (J2; 109):** `not_in_catalogue` gets the same nudge under "What we read": "The importer's sticker often spells the name in Latin letters." + "Scan the sticker".
The pipeline's outcomes stay as the pipeline produces them; the design does not collapse them to three. Two share the §5 card (`matched` ≥ 0.85 "Sure match", 0.60–0.84 "Best guess"). Everything else is **one screen, `outcome`, with one shared vocabulary**:
- **Top bar** as §5: back · kicker · ghost **"Scan again"** (camera-rotate icon) → the camera, §4. **This replaces every inline "Scan again" button.**
- **Status block:** 28px icon in neutral-600 (never accent — nothing here is good news), title 21px/500, one or two lines of 13px neutral-700.
- **"What we read" card** (only when something was read): surface, radius-lg, shadow-sm. Section label "What we read" with the **Read by AI** badge at the right; editable fields **Name** and **Brewery** (44px, prefilled from the read, ground-coloured). **1.7.1 (H, 44):** the field's value is the **Latin reading** (the label's own spelling where it prints one, else Hepburn); when the label is in Japanese, a line under the field, 12px neutral-600, reads "On the label: 澤の花 心" (kanji neutral-800, `lang="ja"`). The line stays when the visitor edits the field: it is what the label says, not what the field holds. **"Search again" searches the kanji while the field is unedited** (the reading is the model's; the kanji is what's printed), and the field's text once edited; hint "Misread? Fix it from the label and search again."; secondary "Search again" → §8 with the edited name. **No confidence on this screen** — the percentage is in the Read by AI sheet only.
- **"Did you mean" (`no_match`)**: up to 3 catalogue sakes nearest the read by **name or brewery**, deterministic, no model call. Matching ignores grade words, polishing numbers, company forms (株式会社) and the 酒造 / 醸造 ending, and folds old/new kanji. **Nothing close → the section is absent**; never padded with weak matches. Reasons, exactly: "Similar name" · "Similar brewery name" · "Similar name and brewery" · "Same brewery" · "Same brewery · similar name".
- **Candidate rows** (when there are any): section label, then rows — Latin name 15px + kanji 12px · brewery · prefecture 12px · a **reason in words** 12px neutral-700 ("Same brewery · closest name", "Similar name · brewery 伴野, not 友野") · caret. **No % tag and no accent**: a candidate is a guess and must not look like a match. Tap → §5 card. Up to 3.
- **"Keep it anyway"** dashed card (whenever something was read). **1.7.1:** the kept name and brewery are written **reading first, kanji in brackets**: "Sawa no Hana Kokoro (澤の花 心)", "Tomono Shuzō (友野酒造)", the same form as §5's suggested bottling name. "Rate it and put it in your cellar now, with the name above. It's marked as your own entry, and we'll link it if the sake turns up in the catalogue." · secondary **"Add this bottling"** → §5 in "Your own entry" mode. What it creates is an **own bottling** (§9a). Minimum to save: **a name** (prefilled); brewery optional.
- Last: ghost "Type the name instead" → §8, then ghost **"How to read a label"** (book icon) → §18. Both on every outcome.

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
| `not_sake` (71) · 1.7 | Not sake | This is shochu, not sake · …awamori… · …umeshu… · This is a liqueur, not sake · This isn't sake (other) | One sentence on the drink ("Shochu is distilled, where sake is brewed.") + "Yawaragi's catalogue holds sake only, so there is no page for this bottle, and it can't go in your journal yet." | read · **no keep** · extra ghost exit "Sake and the other Japanese drinks" → §18 |
| `menu` (72, 73) · 1.7 | A menu | This looks like a menu | Signed in: "Rank the sakes on it for your palate? Reading a whole list takes a few seconds." Signed out: "Sign in and we'll rank the sakes on it for your palate. Or search for one name from it." | **primary "Rank these for you"** → §7 · signed out: **primary "Sign in to rank these"** → §14 (title "Rank lists for your palate") · read (first sake on the list) · no keep |
| `several_bottles`, a shelf · 1.7 | Several bottles | This looks like a shelf | as `menu`, "the bottles in it" / "a whole shelf" | as `menu` |
| `several_bottles`, two equal (74) · 1.7 | Two bottles | Which bottle do you mean? | Two bottles share the photo and neither is clearly the one. Pick yours, or scan one at a time. | "Read from your photo": one row per readable bottle, reason = position + what was read ("Left · name and brewery read") → §5 · no read card · no keep |
| `no_bottle` (90) · 1.7.1 | No bottle | We can't see a bottle in this photo | Point the camera at one bottle, with its label filling most of the frame. | primary "Scan again" → §4 · no read · Phosphor `selection-slash` |
| `no_text_this_side` (75) · 1.7 | No name on this side | Turn the bottle to the side with writing | This side has only a picture. The name is usually on the opposite side or on a small label near the base. | **the photo back** (72×96, "The side you photographed") · primary "Scan again" → §4 |

**1.7 rules for the new rows.** Icons: `not_sake` Phosphor `drop` (neutral liquid, no bottle shape), `menu` `receipt` (its own; "Which one is it?" keeps `list-magnifying-glass`), shelf `squares-four`, two bottles `copy`, no text `arrows-clockwise`. "What we read" may show an empty Brewery field (menus rarely print it); never fill it from the model. **"Keep it anyway" is absent** on all five. With list ranking off (the *menuScan* tweak; the pre-§7 build): menu → "That's a menu, not a label" / "We read one bottle at a time for now. Search for a name from the menu, or scan a bottle's label."; shelf → "More than one bottle in the photo" / "We can't tell which one you mean. Scan one bottle at a time."; read card only.


Message-only states are not "plain copy on the ground": they get the same status block, the same top bar and the same "Type the name instead" exit, so a failure looks like the product, not like an error page. Prototype: the **Scan outcome** tweak picks the branch the next capture lands on.

### 6. Similar sakes · 15 (retaken 1.5)
- Plain ranked list, **no chat, no model call**. Reached from the result card and the bottle page.
- Header: back · "Similar to {name}".
- **Ranked by flavour distance: Euclidean (L2) over the six axes, top 5** — magnitude carries signal, so not cosine (matches `flavor-similarity.ts`). Displayed as "{n}% alike" = 1 − d / d_max. Row, **text only (no thumb, rule 14)**: name 15px/500, brewery 12px, tag "{n}% alike" (accent tag at ≥95, else neutral), and a one-line reason built from the axis differences, e.g. "Same rich and dry, less floral." Lead copy: "Closest by flavour distance across all six axes." Tapping opens that sake's result card.
- Empty (no profile for this sake): a short line and the bottle-page link.

### 7. Menu and shelf results (redrawn 1.7) · 76–82 (33 is superseded)
**1.8 (P; 105):** one "Read by AI" badge under the head (the whole list is read). A row whose line carries a style from the fixed short list gets one line under the row, indented to the name: Phosphor `sparkle` accent-600 · "Less usual · Koshu (古酒), aged sake" 12px · book icon → its Learn entry (no icon and no tap where there is no entry). At most one per row; nothing ranks, groups or filters by it.
One screen for "what should I order from this menu, or take from this shelf?". **Signed-in only.** Reached only from §5a's `menu` / shelf outcome ("Rank these for you"); no camera mode, no Home entry.
- **Reading (76):** after "Rank these for you", the screen opens at once in a reading state: title "Reading the whole menu…" / "Reading the shelf…" 21px · "This takes a few seconds. We're finding each sake and placing it against your palate." · three skeleton rows (neutral-200 bars, `yw-pulse`). Expect 5–10s.
- **Top bar:** back · "From your photo · Menu · 8 sakes" (or "Shelf · 5 sakes"; counts sakes, not lines) · ghost "Retake" → §4.
- **Head:** headline 24px "Order the {first word of #1}" (shelf: "Try the …") · sub 13px "Ranked by how close each sake sits to what you rate highly." with an ⓘ → **"How this is ranked"** sheet (82, §16 pattern): "Each sake is placed by how close its flavour chart sits to the sakes you rate highly. The reasons come from the charts and your ratings, nothing else." / "It works on the sake, not the bottling, so bottlings of one sake share a place. With only a few tastings it's a rough guide, which is why it says so in words and not as a number."
- **Controls:** segmented "For you" / "Menu order" (shelf: "Left to right") · chips: menu "Good warm", "Under ¥1,000", "New to me"; shelf "New to me" only (no reliable prices).
- **Row (77):** rank (heading face; #1 accent-600 + the 2px mark) · Latin name 15px/500 · glass price at the right (menu only) · second line: **what was read** (kanji as printed · grade as printed) 12px, and at the right a **flavour shape**: six 4px bars, 20px tall, accent-500, in the chart's axis order (title/aria = the six values) · **reason** 13px, **built from the charts alone, no model text** (C8): "{two strongest axes}, like the {nearest sake you rated ≥4} you gave {rating}." (nearest by L2, ≥0.8 alike) · "You gave it 3. Floral and light." when tasted · otherwise "{axes}." or, when it fits poorly, "{axes}, not much like what you rate highly." · tags: **fit in words** (C7) — "Close to what you rate highly" (accent tag, L2 similarity to your palate ≥0.82) · "Some of what you like" (≥0.75) · "Not your usual" — then "★ {n} · yours", "Good warm", and **"Partly read"** (outlined) when a line was read without its grade or price (C11). No percentages anywhere.
- **One sake, several lines (78, C10):** one row for the sake; under it, indented 34px, "3 bottlings on this list · one chart for all" 11px, then one 44px row per bottling as printed + price + caret → §5 for that bottling (the §5 "Is it one of these bottlings?" logic applies).
- **Craft sake** is listed with the sakes, its name followed by "(Craft sake)" 12px neutral-700.
- **After the rows (79):**
  - "Couldn't match · 2" (menu only): rows with what was read · price · ghost **"Search"** (→ §8, filled) and ghost **"Add it"** (→ own bottling, §5 "Your own entry") (C5).
  - **"{n} lines we couldn't read"** / "{n} bottles we couldn't read" (eye-slash icon) · "Cut off at the edge or lost in glare. Retake closer to read them." (shelf: "Turned away, cut off or too far. Retake closer to read more.") (C11, C12). Lines without a readable name never get a row.
  - **"Not sake · 7"** (menu only, collapsed, caret): greyed rows (neutral-600) "{as read} · Shochu" + price; no tap; ghost "Sake and the other Japanese drinks" → §18 at the end (C6).
  - End-of-screen block.
- **Fewer than three tastings (80, C4):** no ranking. Headline "What's on this menu" / "What's on this shelf" · sub "In menu order, each with its flavour shape." · a card (surface, hexagon icon) "Rate three sakes and we'll rank lists like this for you." + "{n} of 3 so far" + secondary "Find one" → §8. No sort control, no fit tags; reasons are the axis words only.
- **Shelf (81):** same screen. Rows come from labels and shelf tags; "Left to right" is the order they stand. A tasting flight (three bottles on a counter) is a shelf of three (C13). A brewery's own tasting sheet is read for names only (C14).
- Prototype: §5a outcome *Menu in photo* or *Shelf in photo*, sign in, "Rank these for you". The *listPalate* tweak shows 80.

### 8. Search ("Type it") · 18, 56 (bottlings) — 1.6
**1.8 (M; 102–104):** placeholder "Name, brewery, kanji or a flavour". With an empty query, above "Recently tasted": two chips, **Prefecture** (opens a wrap of prefecture buttons with counts) and **Flavour** (opens the six axes with a Less · More segmented each; More / Less = clearly above / below the catalogue average on that axis, the same comparison "Goes with" uses — never the raw chart value, which Sakenowa scales per sake), plus "Clear" when one is set; under them "Or type a flavour — "grapefruit", "melon" — to find sakes drinkers describe that way." With a filter set, the list is "{n} sakes · {filters} · A–Z"; rows carry no axis figure or word (1.8.1), the chip already says it. The caveat under the axes reads "Compared with the catalogue average on the flavour chart (Sakenowa). Sakes without a chart don't show here." A typed flavour word (EN or DE) that matches a Sakenowa tag lists the tagged sakes, "{n} sakes tagged "grapefruit"", each row "Tagged グレープフルーツ (grapefruit) by Sakenowa drinkers"; no "Add it yourself" row then. No popularity order anywhere (M4).
- 44px field, accent-500 border, autofocus, placeholder "Name, brewery or kanji".
- Empty query: "Recently tasted". With a query: "{n} matches" (searches name, kana, brewery).
- Rows 58px, **text only**: name + kanji · meta · "Tasted" accent tag if you've had it. Tap → result card. **Mixed and ranked by match; on a tie bottlings come first.** Meta: a bottling "Bottling · 李白 · {grade}"; a sake with catalogue bottlings "{brewery} · Sake · 3 bottlings"; **a sake with none (the launch state): the v1.5 row, brewery only** — a line has no grade tags to list. Matching covers the name as printed on the label, including an importer's product name, grade or age attached to it ("Rihaku Wandering Poet" → 李白). No visual change.
- With a query, a dashed row "Add "{query}" yourself — Rate it now, details later" opens the result card in manual mode.
- **Other names (1.7, E1, #413; 88):** search also matches a sake's other names (other readings, export and importer names). When the row matched only through one, it adds a line under the meta, 12px neutral-700: "Also sold as {name}" — the same words §9 uses.

### 9. Bottle page (one per sake) · **1.7: "Also sold as {names}"** (12px neutral-600, comma-separated) under the kanji, above "formerly …", when the sake has other names (E2) · 16, 17 (little published), 35 (panel open), 36 (in cellar), 37 (edit + delete), 53 (bottlings), 62 (former name), 63 (no bottlings), 64 (own only)
**1.8 (I, Q; 100–101):** kept photo block (as §9a) when tastings or bottles sit on the sake. **"Goes with" redrawn:** heading · caveat line naming how the kind was picked + inline ⓘ → "Where these pairings come from" sheet · 2–3 food rows (icon accent-600, food 14px, reason 12px) · optional style note · "Usually served …" with `thermometer-simple`, **only while the page has no "Serve it" section**. No section when nothing places the sake (rule 4); the old fallback line is gone. Caveat text never breaks inside brackets (`word-break: keep-all`).
- Header: back · name (ellipsis). **Nothing else** — wishlist and cellar live in the content. **No sticky bottom bar** — the tab bar is the only thing on the bottom edge.
- Order, personal to general:
  1. **Identity**, text only (no bottle slot, rule 14): name 25px, kanji, brewery · place, **a former brewery name when on record** ("formerly Asahi Shuzō 旭酒造", its own 12px neutral-600 line under the brewery; 62, on the line "Dassai 獺祭"), **no grade or style tags** (Sakenowa has none for a line; guide-linked tags appear only on bottlings) — the only tag a line page carries is "Little published"; "Little published" neutral-outline tag when data is thin. Last line: **"Catalogue data · Powered by Sakenowa ↗"**, 11px neutral-700, underlined link, on the content column (x = the gutter, like every other line). This is the above-the-fold Sakenowa credit (see Answers, B8). Hidden for your own entries.
  2. **Action rows** (padding 10px 20px 0, 8px gaps):
     - Closed: primary "Rate a new tasting" (44px, flex 1) · secondary "Similar" (→ §6). Under it: **cellar control** (flex 1) · wishlist icon button (44×44, bookmark; filled + accent-700 when saved).
     - **"Rate a new tasting" opens §5's log panel in place**, in its own card (surface, radius-lg, shadow-md), taking that row's slot. Under it the row becomes: "Similar" · cellar control · wishlist icon. **Done** closes the panel back to the closed rows; the tasting is already in "You and this sake".
     - **Cellar control:** the count on a **line page includes its bottlings** (2 against Rihaku + 1 Wandering Poet → "In cellar · 3 ›"); on §9a it counts that bottling only. "+" adds to the row of the page you are on. Not owned → secondary "Add to cellar" (stack-plus). Owned → one outline split in two: **"In cellar · 2 ›"** (accent-700, a link to Collection → Cellar) | **"+"** (44px, aria "Add another bottle", adds one and shows the notice).
  3. **You and this sake:** your entries (date block, stars, italic note; a bottling's tasting leads with the bottling name, 13px/500) with a ghost **"Edit"** at the right of each. Edit opens that tasting in the panel (heading "Your tasting · 19 Sep", meta "Changes save as you go"): rating, note, chips, detailed notes, Done, Delete. Or "Not tasted yet."
  3a. **Bottlings** — three states, the first is launch:
     - **None known (63):** no heading, no list; the dashed **"Add your bottling"** row stands alone, 14px under "You and this sake". It is the only place to start an own bottling of a known line.
     - **Only the visitor's own (64):** heading **"Your bottlings"** + "{n} bottling(s)"; rows read "Your own entry" in the meta line; then "Add your bottling".
     - **Catalogue bottlings (53):** heading **"Bottlings we know"** + "{n} bottlings"; catalogue rows first, then the visitor's own (meta "Your own entry"), then "Add your bottling".
     Rows: product name 15px/500, grade · flags 12px, "Tasted" tag, caret → §9a. "Add your bottling" opens the same inline form as §5; saving opens the new own bottling's page.
  4. **Serve it:** six temperatures (5° 雪冷え, 10° 花冷え, 15° 涼冷え, 20° 常温, 40° ぬる燗, 50° 熱燗), recommended ones in accent-500, plus a sentence. Without data: "The brewery hasn't said…"
  5. **The sake:** 2-column spec grid (Rice, Polishing, Yeast, Starter, SMV, Acidity, Alcohol, Water). Unknown: "Not published", italic neutral-700.
  6. **Flavour:** the shared chart, §17 — the first mention on the page, so the heading is "Flavour chart (Sakenowa)".
  7. **Goes with** (replaces Ask's "What goes with it"): 3 static pairing rows — icon 18px · food 14px · reason 12px. Example: "Grilled mackerel, saba shioyaki — The acidity cuts the oil; serve the sake warm." Without data: "No pairings for this one yet. By its style, try it with grilled or savoury dishes."
  8. **What others noticed:** notes (rating · place · when) and common-word tags, or "Nobody has written about this bottle yet…"
  9. **The brewery:** story plus **"Also from this brewery"**: a horizontal row of text cards (surface, shadow-sm, name 13px + meta 11px, no image) using the horizontal-row edge (rule 7). Hidden without data.
  10. **Where to find it:** shop rows, or "Not tracked in any shop yet…"
  11. The end-of-screen block.
- **Sections no bottle can fill yet are hidden, not stated** (today: Serve it, The sake, Goes with, What others noticed, Where to find it — #336–#340). Rule 4 still applies when data is missing for *one* bottle (e.g. the chart). The prototype shows them with sample data as the target.
- The bottling page is §9a.

### 9a. Bottling page (new in 1.6) · 51, 52, 57 (own bottling)
**1.8 (I, Q; 97–98):** last in the identity block, the kept photo: 84×112 radius 8 · "Your photo · kept {date}" 12px neutral-600 · ghost "Replace" (photo-only camera) and "Delete" (inline confirm: "Delete this photo? It goes from this page and from your journal and cellar rows. Your tastings stay." Keep it · Delete photo). With no photo, and a tasting or bottle of it: ghost "Add a photo of your bottle" (`camera-plus`). "Goes with" as §9, placed after "About the {line} line" and before "What others noticed"; the style the bottling names comes first.
**1.7.1 (H3, 91):** an own bottling whose name or brewery holds a reading the model gave carries one quiet line under the own-entry text: Phosphor `scan` 12px · "Reading by AI" 11px neutral-600 · caret → the Read by AI sheet. **No mark inside the name**, anywhere it appears (journal, cellar, search). Stored per field, `aiName` and `aiBrewery`. **Renaming the bottling clears `aiName`**: a name the visitor wrote is theirs, not a reading. The line goes once neither field holds a reading.
One template, §9's order, sections dropping out by what is known (rule 4: hidden, not stated). Naming per the B-Line table: "sake" = line, "bottling" = expression, "bottle" only for what you own.
1. **Header:** back · bottling name. Nothing else.
2. **Identity:** name 25px · **"A bottling of {line} {kanji} ›"** (13px accent-700, kanji neutral-600) → §9 · place · tags: grade first, then flags (Nama, Genshu, Sparkling, Koshu · {n} years), all neutral, guide-linked · credit line (catalogue bottlings).
3. **Action rows:** §9's, **without "Similar"** — Similar is line-level and lives in the line block. Rate a new tasting opens the panel in place; the tasting is stored on the bottling.
4. **You and this bottling** — §9's list for this bottling only.
5. **Serve it** — only when known for the bottling.
6. **The sake:** grid of Grade, Rice, Polishing, Starter, Yeast, ABV always ("Not published" italic), then SMV, Acidity, Size(s), Cask / Age only when known. One 11px source line under the grid ("Label · importer page"); a value read from a scan carries the Read by AI badge.
7. **Other bottlings in this line:** horizontal row (rule 7) of text cards — product name 13px/500, grade · flags 11px — meta "{n} more". Own bottlings of the same line appear here too, for their author.
8. **"About the {line} {kanji} line"**: one block, 1px divider border, radius-lg, padding 14 — title 15px/500 · caveat "Measured for the whole line; bottlings vary." + inline ⓘ (§16, *Measured for the whole line* sheet) · the §17 chart · "Sakes similar to {line} ›" (→ §6 for the line) · any ranking. **Nothing line-level sits outside it.**
9. What others noticed (this bottling) · The brewery (story only; the line page has "Also from this brewery") · Where to find it · end-of-screen block (line 1 only when the page shows catalogue data — a catalogue bottling, or an own bottling with a line).

**Own bottling (57)** — what "Keep it anyway", "Add {query} yourself" and "Add this bottling" create (B2):
- Tag "Your own entry" (neutral outline) first; place = the brewery typed, else "Added by you"; no credit line.
- One line, stated once: no line → "Not in the catalogue yet. Only you can see it, and we'll link it to its sake if it turns up."; with a line → "Your own bottling of {line}, not in the catalogue yet. Only you can see it."
- No line → no line block, so no chart and no Similar. With a line → the line block shows, as for a catalogue bottling.
- The spec grid shows the six fixed rows as "Not published" until §10 "About the sake" fills them; source "Your entry".
- With no line, nothing on the page is Sakenowa's: **the end-of-screen block drops line 1** (rule 15).

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

### 11. Collection · 19, 20, 21 — retaken 1.6
**1.10 (AB6; 131–132):** last under the cellar rows, "Bottles you’ve had" › opens the list of bottles no longer in the cellar (appendix "v1.10").
**1.8 (I3, L3; 99, 106):** a row whose bottle has a kept photo shows it — journal 36×48 between the date and the name, cellar 40×54 at the left; rows without one stay as they are (no placeholder; rule 14). Empty journal, signed out: ghost "Look through a sample collection" under "Scan a label".
- Header "Collection" 26px · search icon · avatar. Segmented: Journal · Cellar · Wishlist. **Wishlist is hidden until it ships**; never show an empty segment for an unbuilt feature.
- **Which segment opens:** the last one used (stored on the device). A first visit opens Journal. Links that name a segment (Home's "All →", a notice's "View", the bottle page's "In cellar · n ›") keep naming it.
- **Journal:** date block (18px day, 10px month) · **Latin name 16px, kanji 12px under it** — a bottling leads with the bottling name ("Rihaku Wandering Poet") with the line's kanji under it · 11px stars at the right · italic note 12px neutral-700 · a **"Full notes"** neutral tag-button (list-checks icon, 28px, aligned with the name) on entries that have detailed notes, opening §10 for that tasting. Newest first. **Tapping a row opens the page of what the tasting was logged against: a bottling's row → §9a, a sake's row → §9.** "Edit" lives there. Rows are divided by 1px divider lines.
  - Backup card (signed out, ≥1 entry, not dismissed): "{n} tastings, only on this phone" / "Sign in to back them up… Nothing is posted publicly." / "Back up journal" · "Not now". Signed in: "Backed up · {n} tastings".
  - Empty: "Your journal starts with one star" + "Scan a label".
- **Cellar:** "{bottles} bottles · {open} open". **One row per thing a bottle was logged against**: 2 bottles of Rihaku and 1 of Rihaku Wandering Poet are two rows ("Rihaku × 2", "Rihaku Wandering Poet × 1 · 720 ml"), never merged — they are different bottles. Row, **text only**: name (the bottling name when known) · "× n" (with size when stored: "× 2 · 720 ml") · kanji · state line — "Unopened · keeps for months, cool and dark" (or "· nama, keep cold") · "Open {d} days · fridge" · drink soon "Open {d} days — best finished this week" (accent-700, hourglass, sorted first; ≥10 days, ≥5 for nama — **OPEN**). Actions: open → "Pour & rate" · "Finished"; unopened → "Open a bottle" · **"Remove one"** while there are several, "Remove" for the last. Each takes **one** bottle off the row. Brewery and *nama* appear when they are stored.
- **Wishlist:** "{n} sakes to try". Row: name · brewery · source ("Scanned at …" / "Saved from its bottle page"; with Ask on also "From Ask · …") · optional stock line. Actions: "Bought it" (→ cellar) · "Tried it" (→ result) · "Remove". **A sake leaves the wishlist once it's logged.**
- Adding anywhere shows a notice ("Saved to wishlist" / "Added to your cellar" / "Another bottle added · 2 in cellar") with **View**.
- Ends with the end-of-screen block.

### 12. Palate · 22, 23 (early), 24 (axis detail), 30 (JP + Ask on), 39 (early, drink picked), 50 (early, rating not live) — retaken / new 1.5
**1.10 (AB; 129–130):** the numbers row and screen are renamed "Your sake in numbers"; the screen gains "What stands out" (after the counts) and "Bottles you’ve kept" (after Grades).
- **Header — the tab pattern** (also §3, §11): one 26px title, one 13px neutral-600 meta line, avatar at the right. No kicker, no third line.
  - ≥3 tastings: title = the strongest axis ("Rich, umami-forward"), meta "Derived from {n} tastings · updates as you log".
  - 1–2: title "Your palate", meta "Taking shape · so far {sake} {rating}" (this replaces the separate "So far" line).
  - 0: title "Your palate", meta "Not yet — it starts with your first tasting".
- **Under 3 tastings (23, 39, 50), in this order:**
  1. **Rating slot** — present **only once rating is available to the user**; absent today (the prototype's **Rating live** tweak). A 3px, 120px-wide three-segment bar plus one 12px line: "{n} more tastings and your first read appears. It learns from what you rate." No button.
  2. **"Start from a drink you know"** — the lead card (surface, radius-lg, shadow-sm, padding 16; also on first-run Home): accent mark + 19px title · "Pick one you already like. We'll sketch a starting palate from it now, and point you at sakes of the same shape." · chips Lagavulin 16 · Riesling Spätlese · Guinness · Fino sherry · Pinot Noir (36px). Picking one opens, under a divider, **"Starting sketch · from {drink}"** with the six axes as 4px bars (the §17 bar, no numbers) and its seed line, e.g. "Smoky and heavy — expect to like rich, dry, savoury sakes. Try kimoto or yamahai." The card always ends with the **caveat line inside it**: "Cross-beverage estimates, not tasting notes." + inline ⓘ (§16). Real ratings replace the seed from 3 tastings.
  3. **"Sakes to try next"**: section label with **"Powered by Sakenowa ↗" folded into the label row at the right** (the §17 caption style) — that is its attribution, no separate row. A 12px lead: before a pick "Three clear, different shapes to start with. Pick a drink above and these follow it."; after "Closest to {drink} by flavour chart." Then **three cards**, not six rows: Latin name 15px + kanji 12px · brewery · prefecture 12px · a reason 13px · two neutral tags. **Before a pick** the three are chosen editorially — aromatic (Floral up, Mild down), rich (Rich and Mellow up, Light down), dry (Dry and Light up, Floral down) — each measured against the catalogue average; reason "A clear shape: {axis} and {axis}." naming the two axes where it stands out most, and those are the tags. **After a pick**: "Same shape as Lagavulin 16: rich and dry.", tags = its strongest axes. Only what we know: axes, brewery, prefecture — no photo, grade or price.
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
**1.8 (L4; 108):** from a §5a menu or shelf outcome the sheet opens over the scan, title "Rank lists for your palate"; the photo and the outcome survive it, and success goes straight to "Rank these for you". Google opens in a pop-up; if it is blocked, fall back to the redirect and restore the photo from the session. This supersedes 73's route to the sign-in page.
- Opens about 650ms after the first save (tasting, wishlist or cellar), or from the journal card / Account.
- Apple · Google · email. **No passwords.** Email → "Send code" (enabled once valid) → 6-digit field (56px, 24px, 0.5em tracking, centred), auto-submits at the 6th digit; "Wrong address?" · "Resend".
- Title and lead by trigger: first log "Keep this tasting" / "It's saved on this phone. Sign in so it's backed up and your palate follows you." · wishlist "Keep your wishlist" / "…and to get a note when it's in stock nearby." · cellar "Keep track of your cellar" / "…bottles and open dates are backed up." · manual "Keep your journal".
- Footer: "Not now", then the disclosure line (keep it on the sheet):
  - **EU:** "No password. Nothing is posted publicly. Your ratings stay private unless you choose to share them."
  - **Japan:** "No password. Nothing is posted publicly. Your ratings help build flavour charts anonymously — you can turn this off in Account."

### 15. Account · 26 (EU), 31 (JP) — retaken 1.6
**1.10 (AA; 133, 137):** a **Help** group after Learn: Add Yawaragi to your home screen · Send feedback · About Yawaragi. The footer starts "Yawaragi {version} · build {sha}".
- Signed in: avatar 52px · name 19px · "email · via Apple". Signed out: "Not signed in" card with "Your {n} tastings live only on this phone…" + "Sign in".
- Groups (rows **min 50px, may grow**; icon neutral-600; value right-aligned neutral-700):
  - **Your journal:** Backup ("Synced just now" / "Off" → sign-in) · Export journal (CSV · JSON).
  - **Display:** **Language** — value "English", sub "Deutsch — coming soon", **not tappable** until DACH launch (then a real switch) · Sake names (Romaji + kanji → Romaji only → Kanji only) · Temperature (°C / °F) · Region & drinking age.
  - **Learn:** **Sake guide** (book icon, sub "What the words on a label mean") → §18 index.
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
**1.10 (AA c; 135–136):** the Read by AI sheet ends with a secondary block button "Report this read", which opens the feedback sheet prefilled.
The canonical pattern for **every inferred or approximate claim**: a short caveat line in 11px neutral-700, an info button whose `aria-describedby` points at the caveat, and a bottom sheet with the full explanation. Scrim `rgba(0,0,0,.55)`, 19px title, close button.
- **The ⓘ sits inline after the last word** and wraps with the text: a 20px box, `vertical-align: middle`, −4px vertical margin, its tap area padded to 44px. Never pinned to the far edge, never centred on a multi-line block. One rule for every caveat in the app.
- **Contrast:** 11px neutral-700 measures **8.1:1 on `surface`** (#bdb9b1 on #232221) and 8.9:1 on the ground — well past AA. A reading of ~4.2:1 means something else is applied (≈65% opacity on the text or an ancestor, or the text resolving to neutral-500, which is 4.4:1 on surface). Caveat text never takes opacity. No token change.
- **"Learn more in the Sake guide"** (ghost, book icon) is the last line of the Japanese-terms and Serving-temperatures sheets → the matching §18 entry. Other sheets don't get one until they have an entry.
- **Measured for the whole line** (§9a): "Sakenowa charts a sake — the {line} line — not each bottling under its name. A ginjō and a genshu from the same line can taste quite different." · "Read the chart and Similar as the family resemblance. Your own rating and notes on this page are about this bottling only."
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

### 18. Sake guide (new in 1.6) · 58 (index), 59 (entry), 60 (label entry), 61 (public), 89 (1.7)
**1.7:** a new group **"Around sake"** with one entry, **"Sake and the other Japanese drinks"** (日本酒 と ほかのお酒) (89): the answer ("Sake is brewed from rice, koji and water. Shochu and awamori are distilled; umeshu and most liqueurs are steeped and sweetened. Many sake breweries make them too.") · facts "How to tell them apart": Sake · Craft sake · Shochu · Awamori · Umeshu · Liqueur, each with its label word · detail: the label word settles it, and Yawaragi lists sake and craft sake only · source NTA. Linked from `not_sake` (§5a), §7's "Not sake" group and the "Craft sake" tag.
A reference for what a label and a bottle mean. **Working name "Sake guide"** (OPEN 10: collision check before it ships). Discovery and learning only: no purchase prompts, no health or effect claims, no model-written text.
- **Where it lives — mostly in context, no tab:**
  - a grade or style tag on §5, §9, §9a → its entry;
  - "How to read a label" on the camera (§4) and every §5a outcome;
  - "Learn more in the Sake guide" at the foot of §16 sheets that have an entry;
  - **one home: Account → Learn → Sake guide** (the index). No Home card: Home stays the core loop. A landing section waits for the public decision (OPEN 9).
- **Index (58):** back · title "Sake guide" 26px · meta "What the words on a label mean. Written by hand, with sources." · **"Start here"** card (surface, shadow-sm, accent mark) → How to read a label · groups **Grades · Styles and processes · Rice · Serving and tasting**, rows 58px min: title 15px/500 + kanji 12px · the two-line answer 12px neutral-700 (wraps; never clamped — German runs ~30% longer) · caret · end-of-screen block.
- **Entry — its own page type, not a long §16 sheet** (59, 60): sheets are for one caveat; an entry has structure, links out and a list, and must be linkable and indexable if it goes public.
  1. Top bar: back · ghost "All topics" (list icon) → index.
  2. Group kicker 11px uppercase · **title 28px/500** (Latin) · **kanji 17px + romaji 13px italic** neutral-600.
  3. **The answer:** heading face 17px/1.5, two lines or so. This is the line the index quotes.
  4. **Facts** (optional): titled list, rows = term 14px/500 (104px column) · value 14px + kanji 13px · note 12px. "What it requires" for grades, "Where things sit" for the label, the six steps for temperatures, the six terms for flavour words (the §16 rule holds: English is an approximation of the brewers' term, never a translation).
  5. **Detail** (optional): paragraphs 14px/1.6 neutral-800.
  6. **Source line**, always: 11px "Source · {source}". Every fact is curated with a source.
  7. **Related**: horizontal row (rule 7) — title 13px/500 + kanji 11px.
  8. **"Sakes of this style"** ("From the catalogue"): §5a-style rows → §5. Built from **bottlings** whose grade or flags match — lines carry no grade — so at launch it is absent until bottlings are curated. **Always behind the age gate.**
  9. End-of-screen block — **line 1 only when item 8 shows**; the entry itself is hand-written, not Sakenowa's. The index never shows line 1.
- **Public or gated (OPEN 9) — drawn so either answer works (61, the *Sake guide public* tweak):** everything above item 8 is brand-free. Public mode = the same page **without the tab bar and without item 8**, under a 56px strip "Yawaragi 和らぎ" · secondary "Open the app" (→ the age gate). The prototype adds a gate link "Sake guide — what the words on a label mean" to show the entry route; if legal says gated, drop the strip and the link and nothing else changes.
- **Copy rules:** EN and DE from day one; no fixed heights anywhere in an entry; titles wrap (balance), never truncate. The prototype's entries are sample text — production entries are written and sourced by hand.

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
15. **End-of-screen block.** Last in every scrolling app screen (not the camera, sheets or Ask): 28px above, left-aligned on the content column, 12px neutral-600. Line 1: "Catalogue and flavour data · Powered by Sakenowa ↗" — **shown only when the screen displays catalogue or chart data**; dropped on an own bottling with no line (§5, §9a), the Sake guide index and any entry without "Sakes of this style" (§18), so Sakenowa is never credited for hand-written or user-typed content (link). Line 2: Impressum · Privacy notice · Cookie settings · Drink responsibly — accent-700 links, 14px apart, 6px vertical padding, wrapping. No divider. Account shows line 2 only.

16. **A tap is answered at once (1.9, S).** The tapped thing takes its press state within 100 ms and holds it until the next screen is there. After 300 ms a 2px accent-500 bar runs along the top edge. After 5 s (a screen) or 10 s (a scan) the wait is said in words, with Cancel. Nothing ends on the error page because of the network, and nothing tapped or photographed is lost to it. **Press tokens:** row and tile → neutral-200 on the ground, neutral-300 on surface · button → as today (accent-400 tint for outline) · chip → accent-200 fill · tab → neutral-200 pill behind icon and label (111).

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
8. **Bottle-level data — DRAWN (1.6; zero-bottling launch state 1.6.1).** §9a, plus §5, §8, §9, §11. Own entries are own bottlings (B2). Cellar freshness for nama still waits on 4.
9. **Sake guide: public or behind the age gate.** Legal position pending; §18 is drawn for both. "Sakes of this style" stays gated either way.
10. **Sake guide name.** "Sake guide" is a working name until the collision check.
11. **Craft sake (1.7).** Listed and matched as sake, marked "(Craft sake)". It is not sake in Japanese law; confirm the catalogue source marks it, and that nothing in legal copy calls it 清酒.
12. **Keeping other drinks (1.7).** Planned, not designed: a non-sake bottle in the journal would need its own kind and must stay out of the palate and charts. Until then §5a's `not_sake` has no keep.
13. **A match from artwork alone (G3).** Not possible today. If it becomes possible it gets its own provenance wording ("Matched by its picture"), not "Read by AI".
14. **Kept photos (1.8, I).** Where they are stored, how long, and that deleting the account deletes them. Location stripping on the device is assumed; confirm it also strips the other EXIF fields.
15. **Learn entries for kijoshu and taruzake (1.8, P4).** Until written, "Less usual" names them without a link.
16. **Demo bottle on the landing (1.8, K3) — CHECKED 19 Oct 2026.** No "Mihon (見本)" in the catalogue (~3,300 lines) or on the web. Still open: a J-PlatPat class 33 trademark search, to close it formally before the loop ships.
17. **Region texts (1.9, Y).** Hand-written with named sources (ADR-0026), 8–10 prefectures at launch. Needs an author and a reviewer before any ship.
18. **Photo cap per account (1.9, T).** If one is set, the number and what happens at it (T, "Size and limits").
19. **Bottle history (1.10, AB).** New personal data on the account (dated add / open / finish / remove lines). Maintainer decides before it is built; privacy-notice line, export and deletion as the journal.
20. **Feedback messages (1.10, AA).** Retention 12 months or until handled, erasure path, privacy-notice line. The contact address for the mail fallback is the Impressum's.

## Files in this bundle
- `Yawaragi Mobile.dc.html`: **the main prototype.** All screens, all behaviour. Logic is in the `class Component` block at the bottom. Tweaks: market, Ask, Menu scan, camera permission, iOS webview, two-tone bars, first run, **Scan outcome** (which §5a branch the next capture lands on; 1.6 adds *Matched, line only*; 1.7 adds *Matched, your bottling fits*, *Matched, brewery not on label*, *Not sake*, *Menu in photo*, *Shelf in photo*, *Two bottles*, *No name on this side*; 1.7.1 adds *No bottle*), **freeScans** (1.8: *Plenty* · *One left* · *None left*, for the nudge note), **notSakeDrink** (which drink `not_sake` names), **menuScan** (list ranking on/off, default on in 1.7), **listPalate** (§7's fewer-than-three state), **Rating live** (§12's rating slot) and **Sake guide public** (§18's pre-gate mode), **connection** (1.9: *Online* · *Slow* · *Offline*, for S and Z; switching Offline → Online shows "Back online") and **journalSize** (1.9: *Long (25)* fills the journal for W and X).
- `Yawaragi Mobile (phone).html`: a self-contained single-file build of the same prototype. It opens directly on a phone.
- `Yawaragi Tokens.dc.html`: the token and component reference (colour ramps, type scale, every component specimen, behaviour rules). "Added in 1.5" holds the provenance badge, AI-written note, floating surface, caveat line, horizontal row edge, tile vs button, end-of-screen block, tab placeholder and cellar control.
- `Yawaragi Core Loop v2.dc.html`: decision record. It shows the result-card options (1a chosen), the thin-data states, and the colour exploration that led to Ginshu (turns 2–6).
- `screenshots/`: 138 reference PNGs at 390×844 (index under Decision log → Screenshots; each Screens section lists its own).
- `Yawaragi Landing.dc.html`: the public landing page, outside the app shell.
- `Yawaragi App Icon.dc.html` (1.8, O): the home-screen icon (1a chosen), sizes, safe zone and manifest values.
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
- **Own entry = own bottling (v1.6).** One record kind instead of two: it gets the bottling page and its "not in the catalogue" treatment for free, and linking it to a line later is a field change, not a migration. → §5, §5a, §9a.
- **Line-level data in one box (v1.6).** A bottling page that showed the line's chart loose would read as that bottle's profile. Fencing chart and Similar inside "About the {line} line" with the caveat keeps the claim honest. → §9a.
- **Former brewery name on the sake page only (v1.6).** The card answers "what is this"; the page is where you check the bottle in hand. One line, no badge. → §9.
- **Sake guide as pages, reached in context (v1.6).** Four tabs and rule 11 rule out a fifth; people arrive with a question in hand (a tag, a misread). One index home in Account; no Home card. → §18.

### Open items
- **Landing page:** the hero needs a real app screenshot.
- **German copy:** not written; the DE switches only show "coming soon".
- **Legal wording:** Austria/Switzerland gate lines and the cookie category descriptions.

### Screenshots
`screenshots/` holds 138 PNGs at 390×844 (1×), captured from the prototype.
- **01–26 are the base: EU (Germany), Ask off, Label only.**
- **27–32 are the variants where Japan or Ask-on differ.**
- **33 is the v1.0 menu screen, superseded by 76–82** (kept for the record).
- **34–50 are new in 1.5; 51–62 new in 1.6; 63–65 new in 1.6.1** (1.6.1 also retook 09, 16, 57, 61, 62); **66–70 new in 1.6.2** (1.6.2 also retook 06, 58); **71–89 new in 1.7**; **90–91 new in 1.7.1** (1.7.1 also retook 44); **92–110 new in 1.8; 111–128 new in 1.9; 129–138 new in 1.10** (06 unchanged: the Menu toggle was never on in it). Retaken in 1.6: 04, 06, 09, 16, 18, 19, 20, 26, 44 (marked ●). Others differ only by the guide-linked tag icon and the extra journal row; the prototype wins.

| # | Screen |
|---|---|
| 01 | Age gate (Germany, law line) |
| 02 | Cookie banner over Home |
| 03 | Cookie banner, Customise |
| 04 | Home ● |
| 05 | Home, first run |
| 06 | Camera, label: "How to read a label" replaces the hint (1.6.2) |
| 07 | Camera, permission denied |
| 08 | Camera, desktop / no camera |
| 09 | Result, before rating ● |
| 10 | Result, logged |
| 11 | Detailed notes sheet |
| 12 | Cross-beverage explanation sheet |
| 13 | Japanese flavour terms sheet |
| 14 | Two-tone bars fallback |
| 15 | Similar sakes |
| 16 | Bottle page, well documented ● |
| 17 | Bottle page, little published |
| 18 | Search ● |
| 19 | Journal ● |
| 20 | Cellar ● |
| 21 | Wishlist |
| 22 | Palate, with chart opt-in card |
| 23 | Palate, early (1 tasting) |
| 24 | Flavour detail (Rich) |
| 25 | Sign-in sheet after first log |
| 26 | Account (EU, sharing off) ● |
| 27 | JP: age gate (20) |
| 28 | JP + Ask: Home, three tiles |
| 29 | JP + Ask: Result with "What goes with it" |
| 30 | JP + Ask: Palate, no opt-in card |
| 31 | JP: Account, sharing on |
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
| 44 | Scan outcome: not in the catalogue ● |
| 45 | Scan outcome: unclear, recent scans agree |
| 46 | Scan outcome: unclear, nothing read |
| 47 | Scan outcome: rate limited |
| 48 | Read by AI sheet over 44 |
| 49 | Scan outcome: something went wrong |
| 50 | Palate early, 0 tastings, rating not live (today's build) |
| 51 | Bottling page (Rihaku Wandering Poet), top |
| 52 | Bottling page: other bottlings + About the Rihaku line |
| 53 | Bottle page (Rihaku): Bottlings we know + Add your bottling |
| 54 | Result, line only: "Is it one of these bottlings?" |
| 55 | Result, Add this bottling open |
| 56 | Search "rihaku": bottlings first, then the sake |
| 57 | Own bottling page (no line) |
| 58 | Learn index (was "Sake guide") |
| 59 | Sake guide entry: Daiginjō |
| 60 | Sake guide entry: How to read a label |
| 61 | Sake guide entry, public mode (pre-gate) |
| 62 | Bottle page, former brewery name, on the line "Dassai 獺祭" (1.6.1) |
| 63 | Bottle page, no known bottlings: "Add your bottling" alone (launch state) |
| 64 | Bottle page, own bottlings only: "Your bottlings" |
| 65 | Result, own entry with no line (no palate line, no Sakenowa credit) |
| 66 | Add to cellar sheet: count, size, nama (1.6.2) |
| 67 | Cellar: one sake in two sizes is two rows (Katori 90) |
| 68 | Own bottling with a sake: "This bottling" (Rename, Delete bottling) |
| 69 | Own bottling: delete confirmation, tastings and bottles stay under the sake |
| 70 | After delete: the sake page with "{name} deleted · Undo" |
| 71 | §5a not sake: "This is shochu, not sake" |
| 72 | §5a menu, signed in: "Rank these for you" |
| 73 | §5a menu, signed out: "Sign in to rank these" |
| 74 | §5a two bottles: pick the one you mean |
| 75 | §5a no text on this side: the photo back |
| 76 | §7 reading the whole menu |
| 77 | §7 menu ranked for you, fit in words, flavour shapes |
| 78 | §7 one sake, three bottlings on the list |
| 79 | §7 end: couldn't match (Search · Add it), couldn't read, Not sake open |
| 80 | §7 fewer than three tastings: menu order + prompt |
| 81 | §7 shelf ranked, "Partly read" |
| 82 | §7 "How this is ranked" sheet |
| 83 | §5 line card with "On this label" |
| 84 | §5 "Add this bottling" from the label: name, grade, polishing, style |
| 85 | §5 the visitor's own bottling fits the label: opened directly |
| 86 | §5 "Brewery not on this label" |
| 87 | Read by AI sheet with the brewery paragraph |
| 88 | §8 search matched through "Also sold as" |
| 89 | §18 "Sake and the other Japanese drinks" |
| 90 | §5a no bottle in the photo |
| 91 | Own bottling kept from a read: "Reading by AI" |
| 92 | §5 "Keep this photo with the bottle", ticked |
| 93 | §5 "This bottle": the label's bottling or any bottling |
| 94 | §4 "Read together with your last one" · Don't |
| 95 | §4 first scans: the three parts to look for |
| 96 | "Which side to photograph" sheet |
| 97 | §9a kept photo · Replace · Delete |
| 98 | §9a Goes with, picked by grade (kunshu) |
| 99 | §11 journal rows with kept photos |
| 100 | §9 Goes with, picked by chart (junshu); served line hidden because Serve it is shown |
| 101 | "Where these pairings come from" sheet |
| 102 | §8 browse: Flavour open, More rich |
| 103 | §8 browse results: Chiba · more rich · A–Z |
| 104 | §8 flavour word "grapefruit" |
| 105 | §7 "Less usual · Koshu" and the list's Read by AI badge |
| 106 | §11 empty journal: "Look through a sample collection" |
| 107 | Sample collection strip |
| 108 | §14 sign-in sheet over the menu outcome |
| 109 | §5a not in catalogue: "Scan the sticker" |
| 110 | §5 best guess: "Scan the side" |
| 111 | S1 slow tap: accent bar after 300 ms, tapped tab held |
| 112 | S4 "Taking longer than usual" notice, after 5 s |
| 113 | S3 offline line (Home uses the saved copy, Z4) |
| 114 | S5 scan not sent: photo kept · Send again |
| 115 | S4 scan taking longer: Cancel |
| 116 | S6 rating not saved: grey stars · Try again |
| 117 | S6 cellar sheet: not added · Try again |
| 118 | W journal filters: Prefecture open, with counts |
| 119 | W Niigata · Grade open, "no grade" note |
| 120 | W2 journal search + rating filter |
| 121 | Z cellar from the saved copy, actions unavailable |
| 122 | Z3 journal row tapped offline: the copy's sheet |
| 123 | X Your journal in numbers: counts, tile map |
| 124 | X stars, breweries, grades, the surprise |
| 125 | X entry row at the end of Palate |
| 126 | U matches as you type |
| 127 | V bottling form: pasteurisation, style pills |
| 128 | V "More" open: starter, koji, other words |
| 129 | AB Your sake in numbers: What stands out |
| 130 | AB grades, Bottles you’ve kept |
| 131 | AB6 Cellar foot: Bottles you’ve had |
| 132 | AB6 Bottles you’ve had |
| 133 | AA1 Account → Help |
| 134 | AA2 Send feedback sheet |
| 135 | AA1 Read by AI sheet with Report this read |
| 136 | AA (c) Report this read |
| 137 | AA5 About Yawaragi |
| 138 | AA3 Sent notice |

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

## v1.6 · Answers to the engineering hand-back on v1.5
Folded into the Screens sections and the prototype; this is the index.

### Part A — verdicts
- **A1 §5a "Did you mean"** — **Accept**, all of it: name-or-brewery nearest, deterministic, normalisation as listed, absent when nothing is close, the five reason phrasings, rows exactly §5a's. Now in §5a.
- **A2 "Not sure? {n} other candidates"** — **Accept**, including the placement: above the chart is what "under the card" meant. Singular "1 other candidate". In §5.
- **A3 "Sakes to try next" before a pick** — **Accept** the three editorial shapes, measured against the catalogue average, and "A clear shape: {axis} and {axis}." The tags follow the same two axes. In §12.
- **A4 Renamed brewery** — **Accept**: the catalogue's current name on the card. The former name: B3.
- **A5 recent-scans screen** — noted, thanks.

### Part B — answers
1. **B1 The bottling page** — drawn: §9a (51, 52, 57), "Other bottlings in this line" and "About the {line} line" with its caveat and sheet (§9a, §16), search rows (§8, 56), "Is it one of these bottlings?" and "Add this bottling" (§5, 54, 55), "Bottlings we know" on the line page (§9, 53), Journal and Cellar rows (§11, 19, 20). Prototype: search "rihaku", or the *Matched, line only* scan outcome.
2. **B2 Own entry** — **an own bottling**, your lean. One record: `own: true`, `line: null | lineId`. It can be linked to a line later, gets §9a's "not in the catalogue" treatment, and an own bottling made under a known line ("Add this bottling") starts linked. Private to its author, as before.
3. **B3 Former name** — **yes, on the sake page only**: its own 12px neutral-600 line under the brewery, "formerly Asahi Shuzō 旭酒造" (62). Not on the card. Hand-kept list, renames on record only — agreed.
4. **B4 Sake guide** — drawn as §18.
   1. *Where:* in context (tags, label links, sheet footers) plus one home, **Account → Learn**, with an index. No Home card, no landing section until 3 is settled.
   2. *Sheet or page:* **its own page type** — title with kanji and romaji, the answer, facts, detail, source, related, sakes of this style. §16 sheets link to it; they don't grow into it.
   3. *Gate:* drawn for both; public mode drops the tab bar and "Sakes of this style" and adds the "Open the app" strip. Tweak *Sake guide public*.
   4. *Name:* **"Sake guide"** for now (plain, translates as "Sake-Leitfaden"); 酒の基本 stays a candidate for the JP market. Collision check before release (OPEN 10).
   Your constraints are in §18's copy rules.
5. **B5** — `github.md` lives at the project root and records the source repo and sync; it isn't part of this bundle and isn't needed to build. Nothing from v1.4 is open on our side; close the thread.

## v1.6.1 · Answers to the follow-up on v1.6
1. **Zero catalogue bottlings (launch).** §5: no section; the card is v1.5's. It appears only when the line has bottlings, catalogue or own. §9: "Add your bottling" stands alone (63). Own bottlings only: heading "Your bottlings" (64); with catalogue ones, own rows follow them under "Bottlings we know". §8: confirmed, the v1.5 row.
2. **Line pages carry no grade or style tags**; guide-linked tags appear only on bottlings (and on a bottling's §5 card). 62 retaken on "Dassai 獺祭". 09 and 16 retaken without tags.
3. **Cellar: one row per thing logged against** — two rows in your example. The line page's "In cellar · n" counts the line and its bottlings (3); a bottling page counts its own.
4. **Fixed.** The palate sentence shows only for an own bottling with a line, reworded "It counts toward your palate through its sake's chart."
5. **Fixed.** Rule 15: line 1 only where the screen shows catalogue or chart data. Dropped on 57, 61, 65, the guide index, and entries without "Sakes of this style".
6. **Fixed, as you read it:** a bottling's row opens §9a, a sake's row opens §9.

## Changelog
### 1.10 · 25 Oct 2026
Answers to #417 round five, blocks AA and AB (appendix "v1.10"). 10 screenshots added (129–138).
- **§11 Cellar** — "Bottles you’ve had" row and screen (AB6).
- **§12 / numbers screen** — renamed "Your sake in numbers"; "What stands out" and "Bottles you’ve kept" (AB).
- **§15 Account** — Help group (home screen · Send feedback · About Yawaragi); version line in the footer (AA).
- **§16 Read by AI sheet** — "Report this read" (AA c).
- **New** — feedback sheet, About Yawaragi screen.
- **Open decisions** — 19, 20 added.

### 1.9 · 22 Oct 2026
Answers to #417 rounds three and four, blocks S–Z (appendix "v1.9"). 18 screenshots added (111–128).
- **Rules** — rule 16 (a tap is answered at once; connection states) and the press tokens.
- **§4** — scan not sent; scan taking longer.
- **§5, §9, §9a** — rating panel "not saved".
- **§8** — matches as you type (U).
- **§9a / bottling form** — pasteurisation, style pills, "More" (V).
- **§11** — journal filters and search (W); offline copy (Z).
- **§12** — "Your journal in numbers" row; new screen (X).
- **Cellar sheet** — "not added".
- **Open decisions** — 17, 18 added.

### 1.8.1 · 19 Oct 2026
Engineering follow-up on v1.8 (appendix "v1.8.1"). 92, 102, 103 retaken.
- **§8** — More / Less against the catalogue average; no figure on rows.
- **§5** — keep-photo row only for visitors who can keep a journal; 24-hour scan note.
- **Files** — screenshot count corrected.
- **Open decisions** — 16 checked (catalogue and web); J-PlatPat class 33 search pending.

### 1.8 · 18 Oct 2026
Answers to #417 round two, blocks I–R (appendix "v1.8"). 19 screenshots added (92–110). New file: App Icon.
- **§0** — hero loop storyboard (K); sample-collection link.
- **App structure** — sample-collection strip.
- **§4** — frame guide title; three parts for first scans + sheet; paired pill with "Don't"; photo-only mode.
- **§5** — "This bottle" choice; keep-photo checkbox; one after-scan nudge.
- **§5a** — "Scan the sticker" on not in the catalogue.
- **§7** — "Less usual" line; one Read by AI badge.
- **§8** — Prefecture and Flavour browse; flavour words.
- **§9, §9a** — kept photo; "Goes with" from the curated table, fallback removed.
- **§10** — "Where and what it cost" part (written, not drawn; N).
- **§11** — photo thumbs; sample link.
- **§14** — sign-in over the scan.
- **Open decisions** — 14–16 added.

### 1.7.1 · 14 Oct 2026
- Follow-up: "Search again" uses the kanji while unedited; renaming clears "Reading by AI".
Answers to the latest #417 (G "No bottle", H). 90–91 added, 44 retaken.
- **§5a** — "What we read" fields hold the Latin reading, "On the label: {kanji}" under each; kept names "Reading (kanji)"; `no_bottle` outcome.
- **§9a** — "Reading by AI" line on own bottlings named from a read.

### 1.7 · 13 Oct 2026
Answers to #417 (appendix "v1.7"). 19 screenshots added (71–89); 33 superseded.
- **§4** — Label / Menu toggle removed; one frame size.
- **§5** — "On this label"; Add this bottling from the label; name composition; grade, styles, polishing as bottling fields; own bottling opened directly when it fits; "Brewery not on this label"; Craft sake tag.
- **§5a** — five outcomes: not sake, menu, shelf, two bottles, no text on this side.
- **§7** — redrawn: menu and shelf, signed-in, fit in words, chart-built reasons, bottlings under one row, partly read, Not sake group, fewer-than-three state.
- **§8, §9** — "Also sold as".
- **§18** — "Around sake" group and its entry.
- **Open decisions** — 11–13 added.

### 1.6.1 · 10 Oct 2026
Follow-up on v1.6 (appendix "v1.6.1"). 5 screenshots retaken (09, 16, 57, 61, 62), 3 added (63–65).
- **§5** — no type tags on a line; line-only section only when bottlings exist; own-entry palate line conditional; credit line dropped for own entries.
- **§8** — zero-bottling row confirmed.
- **§9** — no tags on a line; three bottling states; cellar count includes bottlings.
- **§9a** — credit line rule.
- **§11** — row destination sentence; cellar one row per logged thing.
- **§18** — "Sakes of this style" from bottlings; credit line rule.
- **Rule 15** — line 1 only with catalogue or chart data.

### 1.6 · 10 Oct 2026
Engineering hand-back on v1.5: Part A accepted, Part B answered (appendix "v1.6 · Answers"). Bottlings and the Sake guide drawn. 9 screenshots retaken, 12 added (51–62).
- **App structure** — views `bottling`, `guide`, `guideEntry`.
- **§4** — "How to read a label" link under the hint.
- **§5** — guide-linked tags; "A bottling of {line} ›"; best-guess row spec (A2); line-only "Is it one of these bottlings?" + "Add this bottling"; line caveat on a bottling's chart; own-entry card copy + "Open its page".
- **§5a** — "Did you mean" rules (A1); "Add this bottling"; "How to read a label" exit.
- **§8** — mixed sake/bottling rows, bottlings first on a tie.
- **§9** — former brewery name line; guide-linked tags; bottling labels in "You and this sake"; "Bottlings we know" + "Add your bottling".
- **§9a (new)** — the bottling page and the own bottling.
- **§11** — journal and cellar rows lead with the bottling name; cellar size in the count.
- **§12** — editorial starter shapes and "A clear shape" reason (A3).
- **§15** — Learn group with Sake guide.
- **§16** — "Learn more" footers; *Measured for the whole line* sheet.
- **§18 (new)** — the Sake guide: index, entry, entry points, public mode.
- **Open decisions** — 8 drawn; new 9 (guide gating) and 10 (guide name).
- **Files** — tweaks *Matched, line only* and *Sake guide public*.

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


---

## v1.6.2 · Answers to the engineering notes on v1.6.1
Decisions below are spec, folded into the prototype; screenshots 66–70 show them.

### Decisions
1. **Rename and delete an own bottling (§9a).** Header stays bare. Last section before the end-of-screen block, own bottlings only: a "This bottling" group with two rows, **"Rename"** (opens the §8 naming form, prefilled) and **"Delete bottling"** (the §9 delete dialog, 37). On delete: if the bottling has a sake, its tastings and cellar bottles **fall back to the sake** and the dialog says so ("Your 3 tastings stay, under Rihaku."). With no sake, they **go with it** and the dialog states the counts. Undo notice 6.8s either way (rule 1): "{name} deleted · Undo" restores the bottling, its tastings and its cellar rows in one step and returns to its page. After delete you land on the sake page, or on Collection → Journal when there is no sake.
2. **Size and nama live on "Add to cellar".** It opens a short sheet: count stepper (default 1) · size segmented 180 · 300 · 720 · 1800 ml (default 720) · "Nama (unpasteurised)" toggle, off. Primary "Add to cellar". Same sheet to edit a cellar row. Store on the cellar row: `{count, sizeMl, nama}`.
   - **Row identity is thing + size + nama.** The same sake in 720 ml and 1.8 l is **two rows**; nama splits rows the same way (its drink-soon window differs). Adding a match for an unopened row raises its count; an opened row is never merged into. "In cellar · n" sums every row, as before. This refines v1.6.1's "one row per thing owned".
   - The "+" beside "In cellar · n" opens the same sheet.
3. **"The sake" grid on an own bottling: keep it out** until §10 gains "About the sake". Rule 4: hidden, not stated.
4. **Credit on an own bottling with a sake: confirmed.** "Catalogue data · Powered by Sakenowa ↗" stays above the fold, under "A bottling of {sake} ›". No other Sakenowa line on that page except the end-of-screen block.
5. **"How to read a label" on the camera.** It replaces the hint line under the viewfinder (Label mode only; Menu mode keeps its hint). 13px, accent-300, wraps to two lines if needed. At 390×844 with German the **viewfinder gives way** (it shrinks, min 260px tall); the top row, shutter row and tab bar never move.

### Built differently — accepted
All eight items are accepted as spec: "Learn" / "Wissen", public, site header (closes open decisions 9 and 10); the single Account row; source links with checked dates; "Learn more" opening a new tab with the new labels; the in-place naming form for "Add it yourself" (supersedes 65 as the landing); the add-bottling hint; the Sakenowa credit once in search; "yukihie" and "hanahie".

---

## v1.7 · Answers to the scan-work questions (#417)
Each answer is spec and is drawn in the prototype unless it says otherwise. Screens: §4, §5, §5a, §7, §8, §9, §18.

### A. A bottle that is not sake (71)
1. **Yes, the screen is right**, with the copy as built plus "…and it can't go in your journal yet." Kicker "Not sake".
2. **No "Keep it anyway" for now.** Keeping other drinks is planned (open decision 12); it needs its own kind outside the palate.
3. **Yes:** a §18 entry "Sake and the other Japanese drinks" (89), the screen's third exit.
4. Phosphor **`Drop`**: a neutral liquid, not a bottle shape.
5. **Tell them apart:** one title per drink (shochu, awamori, umeshu, liqueur, "This isn't sake" for anything else). Same layout.

### B. A menu or several bottles in the photo (72–74)
1. Copy as built when ranking is off. With ranking on it becomes the entry to §7: "This looks like a menu / shelf" + "Rank these for you" (signed out: "Sign in to rank these").
2. **List, don't refuse:** two bottles of equal weight → "Which bottle do you mean?" with one row per readable bottle, then §5. Three or more → the shelf outcome.
3. Menu gets Phosphor **`Receipt`**.

### C. Menu and shelf ranking (76–82)
1. **New pass**: §7 is redrawn (above). It now covers bottlings, the early palate and the no-grade-on-a-line rule.
2. **Same screen** for a shelf, without prices, with "Left to right" instead of "Menu order".
3. **The scan notices it** and asks; the Label / Menu toggle is removed. No Home entry.
4. **Fewer than three tastings:** menu order with each line's flavour shape, plus "Rate three sakes and we'll rank lists like this for you."
5. **Yes:** unmatched lines offer "Search" and "Add it".
6. **Greyed, collapsed "Not sake · n"** at the end, with the Learn link.
7. **Words, not a percentage:** "Close to what you rate highly" · "Some of what you like" · "Not your usual", with the §16 "How this is ranked" sheet.
8. **Yes, from the chart alone:** two strongest axes + the nearest sake you rated 4 or more. No model text.
9. **The visible reading state is fine** (5–10s). **Signed-in only**; anonymous visitors get the sign-in prompt.
10. **One row per sake**, its bottlings listed under it ("one chart for all").
11. A line with a name but missing parts **appears, tagged "Partly read"**. Lines with no readable name stay out and are counted: "3 lines we couldn't read".
12. **Yes:** the rows that could be read, then "6 bottles we couldn't read" with a retake hint.
13. **Same screen as a shelf.**
14. **Names only.** The maker's taste map and temperatures are not shown beside ours.
15. **Craft sake is sake**, listed with the sakes and marked "(Craft sake)" (open decision 11).

### D. The bottling read off the label (83–85)
1. **Accepted:** "Add this bottling" on the card whenever the label says more than the line's name.
2. **Line name · product romanised (kanji in brackets) · grade · up to two styles:** "Mizuo Ichiaji (一味) Junmai". The visitor still confirms it.
3. **Yes:** when one of the visitor's bottlings fits, open it directly, with "Not this bottling? All {line} bottlings".
4. **Yes:** "On this label: {product} · {grade} · {styles} · {n}% polished" with the Read by AI badge, on the line's card.
5. **Yes:** grade, styles and polishing become bottling fields, prefilled from the scan in the naming form.
6. **Same screen, mixed.** The row that fits the label comes first, whatever its source; then the visitor's own; then catalogue rows.
7. **Shown** in "On this label" and stored as a field; not on the card otherwise.

### E. Names sold under more than one spelling (88)
1. "**Also sold as {name}**" under the row's meta, only when the match came through that name.
2. **Yes**, §9: "Also sold as {names}" above "formerly".

### F. A match less sure than it looks (86–87)
1. **No** forced "Best guess".
2. **Yes, the quiet cue:** "Brewery not on this label" ⓘ under the brewery, explained first in the Read by AI sheet.

### G. A side with no writing (75)
1. **Copy as proposed.** Kicker "No name on this side"; title "Turn the bottle to the side with writing"; the one line; then primary "Scan again", "Type the name instead", "How to read a label".
2. **Yes, show the photo back** (72×96, "The side you photographed").
3. **Yes, its own wording** if it ever exists ("Matched by its picture"), separate from Read by AI (open decision 13). Not drawn.
4. **The three read states map to outcomes:** text read → the matching rows of §5a as today · text there but too blurred → `unreadable` ("Unclear photo", 46), unchanged · no text on this side → `no_text_this_side` (75). A sharp photo must never land on "Unclear photo".
5. **One exception to the §5a rule** that the top bar carries the only "Scan again": this outcome also has it as the primary button, because turning the bottle and shooting again is the whole answer.
4. **"No bottle"** (90), as built: kicker "No bottle", title "We can't see a bottle in this photo", "Point the camera at one bottle, with its label filling most of the frame.", primary "Scan again", then the two ghost exits. Icon Phosphor `selection-slash`.

### H. What was read, for a visitor who cannot read Japanese (44, 91) · 1.7.1
1. **The reading is the field's value**, with "On the label: 京極" in a line under it. The visitor checks, edits and searches in Latin letters; the kanji stays visible to compare with the bottle.
2. **Reading first, kanji in brackets, keep both:** "Kyōgoku (京極)", "Mizuo Ichiaji (一味) Junmai". The same form for the brewery.
3. **No mark inside a saved name.** The bottling's page says it once, quietly: "Reading by AI" → the Read by AI sheet (91). It goes when the visitor renames the bottling, unless the brewery still holds a reading.

E1 is confirmed as "Also sold as Ichimi" (not "searched for … instead").


---

## v1.8 · Answers to round two (#417, I–R)
Drawn in the prototype unless marked "written". Screenshots 92–110.

### I. Your own photo of a bottle (92, 97, 99)
1. **Under the identity block, full width**, a checkbox row: "Keep this photo with the bottle" / "Only you see it. Location data is removed first, and you can delete it any time." Unticked. Ticked: "Photo kept with {name}" / "It shows on its page and in your journal and cellar. Untick to discard it.", and the thumbnail gets an accent ring and a pin. It follows the "This bottle" choice (L1). **1.8.1:** shown only where the rating panel shows, to visitors who can keep a journal; hidden otherwise. (Supersedes "stays on the phone … uploads at sign-in".)
2. **Only on the bottle page** (the bottling, or the sake when the tastings sit there): "Add a photo of your bottle", shown when the visitor has a tasting or a bottle of it. It opens the camera in photo-only mode, which reads nothing and costs no scan. Journal and cellar rows don't get their own control. One place to add means one place to delete.
3. **Bottle page identity, journal rows, cellar rows.** Not Home's recent tastings: Home stays text-only so it reads at a glance. Where there is none, show nothing. The row is as today and #334's placeholder retires (rule 14).
4. **One per bottling** (or per sake when no bottling is known). The photo is there so the visitor recognises the bottle. A photo per tasting would put the same label on every row, and there would be many more photos to delete. A new "Keep" on a bottle that already has a photo asks first: "Replace your photo from {date}?"
5. **On the bottle page:** "Replace" opens the photo-only camera. "Delete" confirms inline and is final, with no Undo, because the file is removed from storage. The tastings stay. Open decision 14.

### J. "Scan the back" (92, 110, 109)
1. **"The small label with numbers says which bottling this is." + "Scan it"**, in R3's wording, because it says what to look for, not where. It sits **under the card, outside it**: the card is about this sake, the nudge is about the next photo.
2. **Yes, both:** on Best guess, "The name is often printed plainly on the side or on the importer's sticker." + "Scan the side"; on not in the catalogue, "The importer's sticker often spells the name in Latin letters." + "Scan the sticker". Only one nudge ever shows. Best guess wins over missing detail.
3. **One left: show it, with "Uses your last free scan for the next 24 hours."** (1.8.1 wording) None left: hide it. Signed in: no note.

### K. The landing page in motion · written
1. **One loop, about 11 s, from the real screens with demo data:**
   - 0.0–2.5 s **Scan.** Viewfinder over the demo bottle's label, the accent sweep running. Caption "Point at the label."
   - 2.5–5.0 s **Result.** The card rises (yw-rise, 340 ms), "Sure match", the six bars fill left to right (60 ms stagger).
   - 5.0–7.0 s **Rate.** One tap on the fourth star (yw-pop), "Logged · 4" notice.
   - 7.0–10.0 s **Palate.** The hexagon grows from the centre to its shape over 1.2 s, then the title "Rich, umami-forward" fades in.
   - 10.0–11.0 s Hold, then a 300 ms crossfade back to the start.
   **Reduced motion:** the Result frame, still. Captions are real text, translated, outside the phone.
2. **In the hero only.** A pinned phone tied to scrolling is fragile on mobile and slows down a reader who scans the page. The three cards stay as they are.
3. **"Mihon (見本)"**, Junmai, "Demo bottle" in small print, with the 和 mark in the corner. 見本 means "sample", so it can't be read as a real sake (open decision 16). Its chart and rating are made up. The loop shows no glass and no pouring.
4. **One row of three plain lines** below the features, with no numbers: "Every value says where it came from" · "Tested against real label photos" · "Your journal stays private". It ends with a link to the repository. The detail stays in the README.

### L. Built ahead, now drawn
1. **"This bottle"** (93). Accepted as built. It replaces "Add this bottling" in that state. Starting on nama, and the sake page starting "Add your bottling" from the label, are both accepted.
2. **"Don't"** (94). It sits on a pill at the top of the viewfinder, as an underlined text button with a 36px row and a 44px hit area. DE "Nicht" is accepted (open: a longer DE string would wrap the pill to two lines, which is allowed).
3. **Sample collection** (106, 107). The strip is the right shape. It stays put and can't be dismissed, and starting a scan or any save leaves the sample first. Yes, the landing links to it (§0).
4. **Sign-in over the scan** (108). This is spec now, and it supersedes the 1.7 route. The Google pop-up is fine, with the redirect as the fallback.

### M. Finding a sake without its name (102–104)
1. **Filter chips on §8 Search, shown with an empty query.** There is no Browse view: the field is already where people go to find something.
2. **Prefecture, and More / Less on a flavour axis**, first. Flavour words are typed, not picked. Grade waits until bottlings carry it, because a line has no grade.
3. **"Tagged グレープフルーツ (grapefruit) by Sakenowa drinkers"** on the row. The heading reads "{n} sakes tagged "grapefruit"".
4. **No popularity order.** Results are A–Z.

### N. Price and place on a tasting · written
1. **In §10, as its last part, "Where and what it cost".** It is not on §5's panel: one tap must stay one tap.
2. **A Glass · Bottle segmented, then an amount in the visitor's currency.** The currency comes from the locale and can be changed. Nothing is converted. Optional.
3. **Confirmed: free text only.** The field is "Where" with a "Had at · Bought at" segmented control. Never a map, never a location. It is private, never shared, and never part of chart contribution.

### O. Yawaragi on the home screen · `Yawaragi App Icon.dc.html`
1. **1a, the 和 glyph** in accent on the ground, with the short solid accent rule under it. Sizes: 192 any, 512 any, 512 maskable with the glyph inside the 80% safe circle, and an apple-touch-icon at 180. Short name **"Yawaragi"**.
2. **Never prompts.** One row in Account → Help: "Add Yawaragi to your home screen", with the steps for the visitor's browser.
3. **Splash and theme colour #1b1a19, status bar dark, `display: standalone`.**

### P. What is unusual on a menu or shelf (105)
1. **A small highlight**, because the "what was read" line alone gets lost among the other words.
2. **One line under the row**: "Less usual · {style}". It is not a tag (rows already carry four kinds), not a group (with a median of three sakes it would repeat the list), and not a sort or a filter.
3. **A fixed short list only:** kijoshu, koshu, taruzake, shizuku / fukurozuri, hiyaoroshi, polishing 40% or less. Relative rarity on a three-line list means nothing, and on bar lists nama, genshu and muroka are the norm.
4. **"Less usual"** describes; it doesn't recommend. It opens the Learn entry where one exists and is plain text where none does (open decision 15).
5. **Never "the dearest".** Price stays a filter.
6. **Under the head, once.** It is §5's rule too: the badge sits on the heading of what it qualifies, and here that is the whole list.

### Q. "Goes with" (98, 100, 101)
1. **Agreed:** hidden, and the fallback line is removed.
2. **Yes, in §9a**, after "About the {line} line" and before "What others noticed", the same place as on §9.
3. **Not on §5's card.** The card is for identifying and rating; the bottle page is enough.
4. **Never say it twice.** "Usually served …" shows only while the page has no "Serve it" section. When §9.4 ships, the line drops on every page that has it.
5. **Phosphor is fine.**
6. **Keep the form, once, in the caveat only:** "kunshu (薫酒), fragrant sake", reading then kanji in brackets as in H. It never breaks inside the brackets. The sources sheet repeats the four types once.

### R. Which part of the bottle to photograph (94–96)
1. **Yes:** for the first three scans, three shape cards under the viewfinder take the place of "How to read a label". Tapping them opens the drawing. After that the link returns.
2. **Guide only:** the title is "Fill the frame with one label". Nothing claims to know the side.
3. **As proposed**, with one line and one button, and never more than one (J). The paired camera's title follows the part that was asked for.
4. **Yes, in the sheet:** 精米歩合, アルコール分 and a "%" as shapes, each with its English word under it.
5. See J3.

---

## v1.8.1 · Answers to the follow-up on v1.8
1. **Browse by flavour: accepted.** "More rich" means clearly above the catalogue average on that axis, and "Less" clearly below, using the same threshold as "Goes with". **Rows show nothing extra:** no figure and no axis word, because the chip already says it and a word on every row would only repeat it. The caveat under the axes now names the comparison. 102 and 103 are retaken.
2. **Accepted:** "Uses your last free scan for the next 24 hours." DE: "Nutzt deinen letzten kostenlosen Scan für die nächsten 24 Stunden."
3. **Confirmed.** The "Keep this photo" row shows only where the rating panel shows, to visitors who can keep a journal, and is hidden otherwise (rule 4). The "uploads at sign-in" sentence is withdrawn. 92 is retaken signed in.
4. **Fixed:** Files now says 110.

Noted: kept photos ship last, after open decision 14 and the privacy-policy update.

---

## v1.9 · Answers to rounds three and four (#417, S–Z)
Drawn in the prototype unless marked "written". Screenshots 111–128. Order follows the priority list.

### S. A slow or missing connection (111–117)
1. **(a) + (b), not (c).** The press state (b) holds from the tap; the bar (a) joins after 300 ms, so a fast connection sees only the press. No skeleton screens in v1: one drawing per screen, and a grey outline that fills in reads as "loaded" before it is. The scan keeps its own sweep.
2. **Yes,** rule 16's tokens. Held, not flashed: the pressed row stays pressed until its screen opens or the wait is cancelled. The tab that was lit dims while the new one waits (111).
3. **Yes, one line under the status bar,** above the sample strip when both show, never at the bottom (that edge is the cookie banner's and the tab bar's). Neutral-200, wifi-slash icon: "Offline · Saving and scanning need a connection." It stays until the phone says it is back, then "Back online" for 2.4 s and goes. Collection and Home say what they show instead (Z1).
4. **10 s for a scan, 5 s for a screen: agreed.** A screen: a floating notice, "Taking longer than usual · The connection is slow." + **Cancel**, which leaves the visitor where they were (112). A scan: the title becomes "Taking longer than usual", "The connection is slow. Your photo is kept." + **Cancel** (115). At 30 s the scan stops by itself into 5's state. **Try again sends the same photo,** no new shot. **The count:** keep each read for 10 minutes keyed by the photo's hash, so a resend of a photo that did reach us returns the stored answer and costs nothing. Then nothing about counts needs saying except the line in 5. If that cache is not built, add "If it arrived, it counts as one scan." under Cancel.
5. **Drawn (114).** The frame keeps the photo, title "No connection", "Your photo is kept. It wasn't sent, so it doesn't use a scan." + **Send again**; a second tap with no signal adds "Still no connection." The shutter takes a new photo in its place. **It waits for the tap.** When the phone says it is back, the title becomes "Connection is back" and the button "Send now". Sending by itself would use a scan the visitor may no longer want.
6. **(a), agreed.** Rating panel (116): the stars stay where tapped in neutral-600 (not accent, because accent means saved), the label reads "4.0 · Not saved", then a line "No connection, so this isn't in your journal yet." + **Try again**; again with no signal: "Still no connection. Your stars stay here until it's back." No Undo notice, since nothing was saved. **Cellar sheet (117):** the sheet stays open with its values; above the button "Not added · no connection. Nothing here is lost." and the button becomes **Try again**. **Notes sheet** (written): the same line under the sheet title, the fields keep what was typed, Done becomes Try again; closing the sheet asks "Leave without saving your notes?" Quick tags, delete and Undo use the rating panel's line.
7. **Yes,** when the phone says it is offline: wifi-slash, "No connection", "This page needs the internet. Anything you saved before is safe." with **Try again** and **Back to Home**. The catalogue copy stays for real server errors. (Written; it is #324's layout.)
8. **Not before O ships.** After: cache Learn entries once read (fixed text, useful in a bar). The landing stays online only.

### W. Filtering the journal (118–120)
1. **Chips under the segmented control, as built**, shown from 8 tastings. They follow §8's chip and value styles; values carry counts and only those that occur (counts are faceted: each chip counts with the other filters on). Several values in one chip mean "any of"; chips together mean "all of". The summary line is as built; **Clear** on the right.
2. **Separate, but they combine.** §11's search icon opens a field above the chips: "A name, a brewery or a word in a note" (120). The summary line names both.
3. **Yes, in the open Grade panel only:** "{n} tastings name no grade, so a grade filter leaves them out. A grade comes from a bottling you added." (119). Not on the summary line.
4. **Journal only in v1.** A cellar is a handful of rows.
**More** holds Style, Brewery and Month. Rating values are "5 stars", "4–4.5 stars" and so on. An empty result: "No tastings match all of these. Take one away, or clear them."

### X. Your journal in numbers (123–125)
1. **Its own screen,** reached from a row at the end of Palate: "Your journal in numbers · 25 tastings · 15 of 47 prefectures" (125). Not Home, which stays a glance.
2. **A tile grid of 47 squares,** placed roughly where each prefecture is. It needs no licensed outlines, stays legible at 390 px, and every tile is the same size, so small prefectures count as much as Hokkaidō. Shading: 1 · 2–3 · 4 or more (accent-300, 400, 600), none yet neutral-200. Under it, one row per prefecture tasted; tapping one opens the journal filtered to it (W). Sakenowa credit beside the heading.
3. **In this order:** counts (tastings, sakes, breweries) → the map → your stars (spread and average) → breweries you rate highest (by average, from two tastings) → grades ("From the {m} of {n} tastings that name a grade") → the surprise, with the §17 caveat and ⓘ. **Left out:** streaks, litres, bottles per month; see 5. Palate over time waits until a journal spans six months; it is not drawn.
4. **A teaser only:** the Palate row reads "{n} more tastings and your map appears" and does not open.
5. **Avoid any count of drinking over time:** no streaks, no "this month", no litres, no "most in one night". Breweries are ranked by rating, never by how many were tasted. "Worked out from your own journal. Only you see it." closes the screen.

### V. The bottling form (127, 128)
1. **Split by use.** Shown: name; grade + polishing; Pasteurisation as one select ("Pasteurised twice (usual)" · Nama · Namachozō · Namazume, each with its gloss); "Style · tick any" with the eight pills. Behind **"+ Starter, koji, other style words"**: Starter and Koji selects side by side, then Other style words. The section opens by itself when a read filled any of them.
2. **The word alone on §9a's tag** ("Namazume"). The gloss lives in the select and in Learn, which the tag opens.
3. **Yes.** The Nama entry gets a paragraph on the three kinds, and a new Koji entry covers yellow, white and black. ⓘ beside Pasteurisation (drawn) and Koji, opening those entries.
4. **Yes,** as another field under "What we read", once the eval passes.

### U. Matches as you type (126)
1. **The lighter row is right,** with one change: Latin name first at 14px with the kanji after it at 12px, as §8's rows do, so the two lists read the same. The rows wrap; nothing is cut with an ellipsis.
2. **No.** Opening the sake is what the visitor chose. Enter still runs the full search.
3. **Over, as built,** on the floating surface (raised + shadow-float). Pushing would move the chips on every keystroke.
4. **Yes, at most two, above the catalogue,** with a "Yours" tag and "Your bottling" as the meta line.

### Z. The journal and cellar without a connection (121, 122)
1. **One line, the S3 line, worded for the screen:** "Offline · Your journal as of 14:02 · Changes wait for a connection." (and "cellar" on Cellar). Not two lines.
2. **Greyed, as the system's disabled state (45%), with the reason said once in that line.** Hiding them would make rows jump when the signal comes back; tappable buttons that fail waste a tap.
3. **A small sheet with what the copy holds:** name, kanji, brewery, stars, rating and date, the note, and "From the copy on this phone, as of 14:02. The sake's page and editing need a connection." (122).
4. **Yes,** Home's recent tastings use the copy, and its line says so.

### Y. About the region · written
1. **One sentence and "About {prefecture} ›", as built,** only where text exists. The sentence is the entry's first line, so it must stand alone.
   **Entry format:** title (Niigata), kanji (新潟県), the one-sentence answer, then up to four short paragraphs headed **Water · Climate · Rice · Style**, no sake or brewery names, sources at the foot as in other entries. The maintainer's line is the model: "Soft water and cold winters; light, dry, clean sake; Gohyakumangoku rice." Open decision 17.
2. **A "Regions" group in Learn,** listed by name. No second map: X's tiles are about the visitor's tastings, and a region index sorted on a map would hide the eight that have text among 47 that don't.
3. **Yes:** with one prefecture picked in §8, a line under the chips: "About Niigata ›".

### T. Photos with tastings · written
Supersedes I2–I4 where they differ; ships after open decision 14.
1. **Borrow down only, from the bottling,** as engineering proposes. A borrowed photo carries a 14px bottle glyph in its corner, and its full-screen view says "Photo of the bottling". A bottling never borrows from a tasting.
2. **One switch:** "Keep this photo" keeps it with whatever the visitor saves next from that card: rating → the tasting; Add to cellar → the row; Add your bottling → the bottling. When "This bottle" (L1) names a bottling with no photo yet, the bottling gets it as well (one upload, two references). **Unticked every time:** this is personal data, so each photo is its own decision.
3. **Tasting:** in §10 as its own part, "Photo", before "Where and what it cost". Not on §5's panel, so one tap stays one tap. **Cellar row:** last row of the Add to cellar sheet, and in the row's edit. **Bottling:** its page (I5). Each offers **Camera** (photo-only mode) and **Library**.
4. **Yes:** Replace · Delete in the same place on all three; Delete confirms inline and is final (I5).
5. **One per slot.**
6. **Journal row:** the tasting's photo, else the bottling's (marked). **Cellar row:** the row's, else the bottling's (marked). **Bottle page:** the bottling's, with each tasting's photo as a thumb in "You and this bottling". **Home** stays text-only.
7. **Yes:** full screen on the camera ground; top: back; under the photo: what it belongs to, the date and, for a tasting, "Where"; then Replace · Delete.
8. **Once, where a photo is first added:** I1's line "Only you see it." Nothing more until #476.
**Pour & rate** carries the row's photo to the new tasting by default (same visitor, same file); it can be removed in §10. **Rows are not split** by photo: a cellar photo belongs to the row. **Uploading:** the record saves first; the thumb shows a thin accent ring while the photo uploads; a failed upload marks the thumb "Not uploaded · Try again" (S6). **At a cap** (open decision 18): "You've kept {n} photos, the most we hold. Delete some in Account → Your photos." Account gets a "Your photos" list for deleting and export.

### I. Your own photo of a bottle
Answered in v1.8; T above widens it. Ships with T.

### K. The landing in motion
Answered in v1.8 (written storyboard). No change.

---

## v1.10 · Answers to round five (#417, AA–AB)
Drawn in the prototype unless marked "written". Screenshots 129–138.

### AA. Feedback, and an "About" page (133–138)
**(b) with (c) feeding it, and (a) as the fallback: agreed.**
1. **Account → Help, under the home-screen row:** "Send feedback" (sub "Something wrong, a missing sake, an idea") and "About Yawaragi" (133). **(c) lives in the Read by AI sheet,** as a secondary block button "Report this read" under the sheet's text (135). Every model-written value already opens that sheet (result card, §5a "What we read", §7's list badge, the "Reading by AI" line on §9a), so one placement covers all of them and the card stays as it is. **Not** on Home, the camera, "Don't" or the end-of-screen block: those are for using the app, and the end block is fixed legal text (rule 15).
2. **A sheet,** up to 90% height, same as §10 (134). In order: title · "What is it about?" four pills (Something’s wrong · A sake is missing · An idea · Other), **required**, nothing preselected · "Your message", up to 1,000 characters; the counter "{n} / 1,000" appears from 900 · "Email for an answer · optional", with "Only used to answer you. Deleted with your message, at the latest after 12 months." · "Sent with it: Yawaragi {version} · this screen ({name})" · primary **Send**, disabled until a kind and a message · "Or write to us by email" (the mailto fallback, (a)). The placeholder follows the kind ("Its name, and the brewery if you know it" for a missing sake).
   **Report this read (136):** title "Report this read"; the kind is set to Something’s wrong and the pills are hidden; a block "What we read" shows the name, brewery, outcome and confidence that will be sent; the message placeholder "What’s wrong with it? The name, the brewery, the match…"; under it "Your photo isn’t sent. It was discarded after the read." When the visitor kept the photo (T), it is still not attached in v1.
3. **A notice, and back where they were** (138): "Thanks — sent. We read every message." or, with an email, "Thanks — sent. We’ll answer by email." 4 s, no action. **No copy in the app** of what was sent: that would be a message history to store and show. With an email given, the reply quotes it.
4. **Yes, signed out too,** with its own daily limit (3), not the scan's count. The sheet says so once: "Without an account you can send three a day." At the limit Send is replaced by "You’ve sent three today. Write to us by email instead." with the mailto link. Offline or with storage off: the same line, mailto only.
5. **Its own page, Account → Help → About Yawaragi** (137), not the landing (which is before the age gate and for people deciding; About is for people using it). In order: the 和 mark and name · one paragraph on what the app is and that the journal is the visitor's · "Where the data comes from": Sakenowa (names, breweries, prefectures, flavour charts, link) · National Tax Agency (grades, label rules, regions) · the Sake guide (hand-written, sources at the foot of each entry) · "Reading labels": what is read, the "Read by AI" mark, the photo discarded unless kept, the service named in the privacy notice (not here, so the page doesn't go stale when it changes) · "Open source": the Sakenowa MCP server, link · "Version" with the build · **Send feedback** · the end-of-screen block (Impressum · Terms · Privacy notice · Drink responsibly).
6. **Both.** About shows "1.10.0 · build {short sha}"; the Account footer starts with the same string ("Yawaragi 1.10.0 · build b3af89d · Impressum · …"). The feedback sheet attaches it, so nobody has to copy it.

### AB. What you bought, and what your journal says about you (129–132)
1. **A section of the numbers screen, which is renamed "Your sake in numbers"** (Palate's row too). "What stands out" sits second, right after the counts, because it is the part worth reading (129). Not its own screen (three sentences don't need one), not Home (stays a glance).
2. **At most three, one of each kind,** so they never repeat each other. Order: contrast → match → gap → share → drift; a kind shows only when its number holds up (below). They are recomputed on every visit, so they change as the journal grows. **No dismiss in v1:** dismissing needs a stored list of hidden insights, and three plain sentences are not loud enough to need it.
   **Thresholds:** the section appears from 8 tastings (5–7: "{n} more tastings and what stands out appears here."). Contrast and share need 8 bottles; contrast needs the higher category from 3 tastings; match needs 4 tastings rated 4.5+ with 3 in one area; drift waits for six months (X3).
   **Card:** surface, 15px/500 sentence, then a 12px basis line saying exactly where the number comes from. Under the heading: "From {n} tastings and {m} bottles".
3. **Both, under one honest name: "Bottles you’ve kept"** (130). Not "bought" (gifts), not "owned" (sounds like now). Two bar groups, grade then prefecture, top four each, in the grades section's style; meta "{m} bottles, in your cellar now or before"; foot "Each bottle counts once, whether you bought it or were given it." **No size breakdown:** sizes summed are litres (X5). It shows from 5 bottles.
4. **Welcome, worded as a place, not a shortfall, and only for regions the Sake guide covers (Y):** "Nothing from Hyōgo yet." · "One of the regions the Sake guide describes." · **"About Hyōgo ›" opens the region's Learn entry,** never Search: a filtered search is a shopping list. Drop "where the catalogue has 140 sakes", which reads as a push. At most one gap at a time, the first region with text the visitor hasn't tasted. (In the prototype the link opens the guide index; the region entries don't exist yet.)
5. **Under 20 tastings the basis says so:** "From your first 12 tastings and 9 bottles", and match adds ", so far". Shares are always counts ("6 of 15 bottles"), never percentages: a percentage of ten bottles overstates itself.
6. **Visible, as a list, never counted per period** (131, 132). Last row under the cellar: "Bottles you’ve had" · "Finished or taken out of the cellar" ›. The screen: "Bottles that are no longer in your cellar, newest first. Only you see this." then one row per bottle: name, kanji, "Added {date} · Finished {date}" (or "Removed"); tapping opens its page. **No total on the row or the screen,** no grouping by month: the list is a memory aid, not a tally. Rows are removed one by one (swipe or the row's ⋯, written) and go with the account.

**Limits, as asked:** none of these sentences counts drinking over time. Kept bottles feed the share and contrast insights only as counts of kinds.
