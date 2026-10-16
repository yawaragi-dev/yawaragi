# Questions for the designers

Open questions the build has run into and settled provisionally, so they can be handed to the designers in one go. Each says what is built today, so nobody has to guess. Opened 2026-10-13; filed as #417.

Round two (blocks I–L) starts at the end of the file.

The design snapshot these refer to is `design/README.md`, v1.6.2.

## A. A bottle that is not sake

The scan can now tell, from a word printed on the label (焼酎, 泡盛, 梅酒, リキュール), that a bottle is shochu, awamori, umeshu, a liqueur or another drink. The catalogue is sake only, and makers of these drinks often brew sake too, so before this the scan showed the maker's sake as if it were the bottle.

Built: a §5a outcome screen, in the shared outcome layout. Kicker "Not sake"; title "This is shochu, not sake" (one per drink); one sentence about the drink ("Shochu is distilled, where sake is brewed.") and "Yawaragi's catalogue holds sake only, so there is no page for this bottle."; then "What we read" with the name and brewery editable and "Search again"; then "Type the name instead" and "How to read a label".

1. Is this the right screen, and is the copy right? There is no drawing for it.
2. Should it offer "Keep it anyway"? It does not today. A visitor may well want the shochu they drank in their journal, but the journal, the palate and every chart are about sake. If yes: is it an own bottling like any other, or marked as another drink?
3. What should "read about it" open? There is no Learn entry on shochu, awamori or umeshu, and Learn is defined as sake education. One entry, "Sake and the other Japanese drinks", would give this screen something to link to. Wanted?
4. The icon is a bottle (Phosphor `BeerBottle`). Is there a better neutral one?
5. Do the five drinks need telling apart at all, or is one "This isn't sake" screen enough?

## B. A menu, or several bottles, in the photo

Until menu scan exists, the scan says what it saw instead of naming one sake from the page. Before this, a menu page for a rice shochu came back as a sure match for a sake of the same name.

Built: two §5a outcomes. "That's a menu, not a label" — "We read one bottle at a time for now. Search for a name from the menu, or scan a bottle's label." And "More than one bottle in the photo" — "We can't tell which one you mean. Scan one bottle at a time." Both keep "What we read" (the first or most prominent drink), so the visitor can search from it.

1. Copy and layout for both.
2. Several bottles: when one bottle is clearly the subject and others are only in the background, the scan reads that one as usual. When two share the frame equally it refuses. Is refusing right, or should it list the bottles it can read and let the visitor pick?
3. The menu outcome uses the same list icon as "Which one is it?". It needs its own.

## C. Menu scan as a feature: "what should I order from this menu, or take from this shelf?"

§7 (screenshot 33) draws menu results for a restaurant menu, ranked for the visitor's palate, and is marked deferred. The maintainer wants it prepared as its own feature, and wider than a menu: a shop shelf is the same question.

1. Is §7 still the design to build, or does it need a new pass? It predates bottlings (v1.6), the early Palate, and the rule that a line has no grade.
2. A shelf. Is "several bottles in one photo" the same screen as a menu, with bottles instead of printed lines? §7 shows prices per glass and "Menu order"; a shelf has neither in a reliable form.
3. How does the visitor get there? §4 has a Label / Menu toggle on the camera. Alternatives: the scan notices a menu or a shelf by itself and asks "Rank these for you?", or a separate entry on Home. Noticing by itself already works in the read.
4. A visitor with no palate yet (fewer than three tastings). §7 ranks "for you". What does the list show for them: menu order with the chart shape of each, the starter shapes from §12, or a prompt to rate something first?
5. Lines the catalogue does not have. §7 has "Couldn't match · 2" leading to search. With own bottlings, should an unmatched line also offer "Add it yourself"?
6. Other drinks on the list. A real izakaya menu mixes sake, shochu and umeshu on one page. Hide the others, list them greyed under "Not sake", or say nothing?
7. "{n}% for you" on a row. The palate works on the six flavor words of a line, not of a bottling, and with few tastings the number is weak. Is a percentage the honest form, or words ("Close to what you rate highly")? §16's caveat-and-sheet pattern would apply either way.
8. The reason line on a row ("2 lines then clamp") was model-written in the prototype. Can it be built from the chart alone ("Rich and dry, like the Kikuhime you gave five stars"), with no model text?
9. Cost and limits: a menu read is a larger and slower model call than a label. Is a visible "this takes a few seconds" state acceptable, and should anonymous visitors get it at all?

What 21 real photos say (14 menus, 7 photos of several bottles, collected 2026-10-13 and kept in `evals/label-scan-jp/`), for the questions above and six new ones:

- The scan tells a menu or several bottles from one bottle on all 21, with no mode chosen by the visitor (question 3).
- A read of one photo takes 5 to 10 seconds; a list read is estimated at 2 to 3 cents (question 9).
- Menus almost never print the maker. A bar's list prints name, prefecture, bottling and grade; a restaurant's prints name and price. The model invents a maker when asked for one.
- A real izakaya card is mostly other drinks: two lines of sake among beer, cocktails, shochu, highballs and sours (question 6).

10. One sake, several lines. A bar's list had three bottlings of one sake on a page, a shop shelf three of another. The catalogue knows the sake only, so all three rows would carry the same chart and the same "for you". Show them as three rows that say so, or as one row with the bottlings listed under it?
11. A line that is half there. Photos taken at an angle cut cells at the edge, and glare or blur leaves a name without its grade. Does a row for such a line appear with what was read, appear marked "partly read", or stay out, with "3 lines we could not read" at the end?
12. A shelf has no lines to read from. On a shop shelf the names come from labels and printed shelf tags, several bottles of a kind stand side by side, and bottles at the edge are cut off; a bar's window at night gave one readable label of ten. What does the result look like when most of the frame could not be read: the few rows that could, with a count of the rest?
13. A tasting flight: three bottles and three glasses on a counter. That is "which of these three is for me", or "tell me about these three". Same result screen as a shelf, or its own?
14. A brewery's own tasting sheet numbers its products and prints a taste map and serving temperatures for each. Is anything from the page worth showing beside our own data, marked as the maker's, or is the page only a list of names to us?
15. Craft sake (brewed with hops or barley koji) is on bar lists beside sake, and is not sake in law. List it with the sakes, under "Not sake", or as its own kind?

## D. The bottling read off the label

The catalogue stops at the sake (the line). The scan now also reads what the label says about this bottling: the product name (一味), the grade (Junmai Ginjō), style words (Nama, Genshu) and the polishing ratio.

Built, for a visitor who keeps a journal, under a matched result card:

- "Is it one of these bottlings?" (§5, screenshot 54) with the visitor's own bottlings of the line. The one the label points at comes first and reads "Your own entry · fits this label".
- "Add this bottling", showing the name it will start from ("Mizuo 一味 Junmai"), opening the naming form (55) filled in with it.

1. §5 says a line with no known bottlings shows the plain card, with no "Add this bottling", and that adding lives on the sake's page. The build now shows "Add this bottling" on the card whenever the label says more than the line's name, because that is the moment the visitor has the bottle in hand. Accept, or move it?
2. §5 (55) prefills the form with the line's name. The build prefills the fuller name. How should that name be composed? Today: line name in Latin, product name as printed (often kanji), grade, up to two style words — "Mizuo 一味 Junmai", "Ikekame Junmai Ginjō Nama Genshu". A visitor who does not read kanji gets kanji in the middle of a name they are asked to confirm.
3. When one of the visitor's bottlings fits the label, should the scan open that bottling's card directly instead of the line's card with a list under it? Today it only puts it first.
4. The grade and style are read by the model and shown nowhere yet except inside the suggested name. §5 gives grade and style tags to a bottling's card only. Should a line's result card show "On this label: Junmai Ginjō · Nama" with the Read by AI badge, so the visitor sees what was read before adding anything?
5. An own bottling stores a name only (and a brewery when the sake is not in the catalogue). §5 says "brewery, grade and size are optional — add them later in Detailed notes". Should grade, styles and polishing become fields of a bottling, filled from the scan, so that guide-linked grade tags and "Sakes of this style" have something to work on?
6. Catalogue bottlings do not exist yet (Sakenowa has no such level). If they are added later from another source, the same read picks one: is "Is it one of these bottlings?" with catalogue rows and own rows mixed still the intended screen, and which comes first?
7. The polishing ratio is read but used nowhere. Wanted on the card, or only once bottlings have fields?

## E. Names sold under more than one spelling

Tracked in issue #413 (alternative names). Two questions there are for design:

1. When a search finds a sake through another name ("Ichimi" for Mizuo Ichiaji, "Wandering Poet" for Rihaku), how does the row say so? The build would follow the existing "searched for … instead" line.
2. Should a sake's page list its other names ("Also sold as …")?

## F. A match the scan is less sure of than it looks

When a front label prints the brand alone, the brewery in the read is the model's own knowledge, not something it saw. One bottle in the test set is misread this way with high confidence (黒兜 read as 黒龍, 0.85), and shows as "Sure match".

1. Should a match whose brewery was not printed show as "Best guess" whatever the confidence? It would be honest for that bottle, and would also turn 11 correct "Sure match" results among the 79 older test photos into "Best guess". Not built.
2. Or a quieter cue on the card: "Brewery not on this label" beside the brewery name, with the Read by AI sheet explaining it?

## G. A bottle with no writing on the side that was photographed

Added 2026-10-13, after the list had gone to the designers.

Some bottles carry a drawing on one side and all their text on another. A visitor photographs the side they find striking: the test set now has a sharp photo of a frosted bottle with a drawn figure and not one character in the frame. The model says so honestly (one bottle, nothing to read), and the scan then shows "unclear photo", which tells the visitor to retake a photo that is perfectly sharp.

Built ahead of the spec on branch `scan/read-romaji`: the read says which it is — text read, text there but too blurred to read, or no text on this side — and the last gets its own §5a outcome, with the copy proposed in question 1. A photo with no bottle in it at all (a loose tag, a table) gets one too: "No bottle" / "We can't see a bottle in this photo".

1. Copy and layout for that outcome. Proposed: kicker "No name on this side"; title "Turn the bottle to the side with writing"; one line, "This side has only a picture. The name is usually on the opposite side or on a small label near the base."; then "Scan again", "Type the name instead" and "How to read a label".
2. Should it show the photo back, so the visitor sees which side was taken?
3. Naming a sake from its artwork alone is not possible today (there is no source of label images). If it ever becomes possible, such a match would be a guess of a new kind: does it get its own provenance wording, separate from "Read by AI"?

## H. What was read, for a visitor who cannot read Japanese

A read that is not in the catalogue was shown in kanji alone ("What we read": 京極 / 二世古酒造), which a visitor who does not read Japanese cannot check against the label, search for, or recognise later. Maintainer report, 2026-10-13.

Built on branch `scan/read-romaji`: the model also gives the name, the brewery and the bottling's name in Latin letters (the label's own spelling where it prints one, a Hepburn reading where it does not). Under each field of "What we read" a line says "In Latin letters: Kyōgoku", for as long as the field holds what was read. "Keep it anyway" saves "Kyōgoku 京極", and "Add this bottling" offers "Mizuo Ichiaji 一味 Junmai" (this answers D2).

1. Is a line under the field the right place, or should the Latin reading be the field's value with the kanji beside it?
2. Reading first, then kanji ("Kyōgoku 京極"), for a kept name: right order, and right to keep both?
3. The reading is the model's. It sits under the card's Read by AI badge; does it need its own mark where it appears in a saved name?

---

# Round two (opened 2026-10-15, against design v1.7.1)

Blocks A–H were answered in v1.7 and v1.7.1. The blocks below are new: two are things built ahead of the spec that need drawing, three are ideas the maintainer wants designed before they are built.

## I. Your own photo of a bottle

Issue #448. Today the scan photo is discarded once read. The idea: let a visitor keep it, or add a photo later, so their journal and cellar show the bottles they actually had.

Nothing is built. The legal side is settled enough to design against: keeping a photo is something the visitor asks for, so there is **no consent dialog** — one explicit, unticked control, and a line saying where the photo goes and that it can be deleted. Location data is stripped on the device before upload.

1. On the scan result card: a control such as "Keep this photo with the bottle", off by default. Where on the card, and what does it look like once on?
2. "Add a photo" later: on the bottling page, a journal entry, a cellar row — all three, or only the bottling?
3. Where a kept photo shows: the bottling page's identity block, journal rows, cellar rows, Home's recent tastings? And what shows where there is none (today's placeholder, #334)?
4. One photo per bottling, or one per tasting (the same bottle on different evenings)?
5. Replacing and deleting a photo.

## J. "Scan the back" when the front says too little

Issue #449. Many front labels carry the name and little else; the grade, the polishing ratio, the rice and the importer's German sticker are on the back. The scan already reads a second photo together with the first ("This photo is read together with your last one"), but nothing tells the visitor a second photo is worth taking.

Nothing is built. Proposed: on a matched card whose read has no bottling detail, one quiet line — "The back label usually says which bottling this is" — and "Scan the back", which opens the camera for a photo read together with this one.

1. Copy, and where the line sits on the card (under "On this label"?).
2. Does it also show on "not in the catalogue" and "Best guess", where the back label may decide the match?
3. A visitor with one free scan left: show it, show it with a note, or hide it?

## K. The landing page in motion

Issue #450. The hero's phone is still a placeholder (§0: "replace with a real app screenshot"). The maintainer wants the three features shown in motion — the landing is also what a recruiter sees first.

Nothing is built. Proposed: the hero's phone plays a short loop built from the real screens with demo data — a label being scanned, the result card, a one-tap rating, the palate chart filling in — a few seconds each; a still frame for visitors who prefer reduced motion. Optionally the phone stays pinned while "Three things, done well" scrolls past and its screen changes with each card.

Constraints from the build: the landing sits before the age gate, so the loop cannot show a real sake's name, chart or rating — a made-up demo bottle, with the Yawaragi mark; no drinking shown; every word translated.

1. The sequence and timing of the loop. Which moments?
2. Pinned phone with scrolling features, or the loop in the hero only?
3. The demo bottle: its label and name.
4. Anything about how the app is built for the landing ("provenance on every value", evals, privacy), or does that stay in the README?

## L. Built ahead of the spec, to be drawn

All four are in production; they work, but nobody has drawn them.

1. **"This bottle"** on a matched card whose label names a bottling none of the visitor's own fits (#446): a choice between that bottling (the default; created at the first rating or bottle added) and "{line}, any bottling". "Add to cellar" starts on nama when the label says nama. The sake page the scan leads to starts "Add your bottling" from the label's bottling.
2. **"Don't"** on the line "This photo is read together with your last one" (#445): reads the new photo on its own instead. DE "Nicht".
3. **The sample collection** (#455): a visitor without an account can open "Look through a sample collection" from the empty Collection tab. It shows made-up tastings of real sakes, a cellar and one own bottling on Home, Collection, Palate, the sake page and the bottling page, all read-only. A line across the top says "A sample collection · Made-up tastings of real sakes. Nothing here is saved." with **Leave**. Is that line the right shape? Should the landing link to it too (for people deciding whether to try the app)?
4. **"Sign in to rank these" opens sign-in over the scan** (#440) instead of going to the sign-in page as 1.7 drew it. The page lost the menu photo on the way back; the sheet keeps it. Google opens in a pop-up.

## M. Finding a sake without its name

From the 2026-10-11 review: search finds a sake only by name. The catalogue already holds what browsing needs — the prefecture, the six-axis chart (for 44% of sakes), Sakenowa's rankings, and Sakenowa's 141 flavor words (グレープフルーツ, 柑橘, 酸味, ワイン, メロン …). Issue #451 adds the last as "flavors in your own words": "grapefruit" finds the sakes tagged グレープフルーツ, with no model call.

Nothing is built.

1. Where does it live: filter chips on §8 Search, a "Browse" view of its own, or both?
2. Which filters first: prefecture, "more / less" on a flavor axis, a flavor word, grade?
3. A flavor word typed in English or German that matches a Japanese tag: how is the match shown, so it does not read as our own tasting note? ("Tagged グレープフルーツ by Sakenowa drinkers"?)
4. Rankings: does a popularity order belong in the app at all, given the age-gate and non-promotional rules?

## N. Price and place on a tasting

From the 2026-10-11 review: a tasting holds stars, notes, tags and the §10 sheet, but not what was paid or where it was had or bought. Competitors keep both.

Nothing is built.

1. In §10's sheet, or as two quiet optional fields on §5's panel?
2. Price: per bottle or per glass, and in which currency (the visitor's, or free text)?
3. Place: free text only (a bar's name), never a map or location — confirm.

## O. Yawaragi on the home screen

From the 2026-10-11 review: the app is used on a phone in a bar, but it cannot be installed — there is no web app manifest.

Nothing is built. The build would add a manifest (name, icons, the dark ground as theme colour) so "Add to Home Screen" gives a proper icon and opens without the browser's bar.

1. App icon at the sizes a manifest needs (192, 512, maskable), and the short name under it ("Yawaragi"?).
2. Does the app ever suggest installing, or only the browser's own menu?
3. The splash colour and whether the status bar is dark.
