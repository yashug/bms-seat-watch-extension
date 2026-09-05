# Chrome Web Store submission

Everything the listing form asks for, in the order it asks. Copy the fenced blocks
verbatim; the notes outside them are for you, not for the form.

---

## Name

```
Seat Watch for BookMyShow
```

Deliberately *not* "BMS Seat Watch". BMS is BookMyShow's own abbreviation, and
`<Brand> <Function>` is the construction that reads as a first-party product — the
shape most likely to be rejected under the trademark rules, or pulled later on a
complaint, which costs you the install base you had by then. "X for Y" signals
third-party status grammatically, and it matches how people search: "bookmyshow seat
alert", never "BMS". Everything inside the extension says just **Seat Watch**, which
is what it already said.

## Summary

The short description, shown under the name in search results. Hard limit 132 characters;
this is 85. It doesn't repeat "BookMyShow" — the name directly above it already said that,
and the space is better spent on what the thing does.

```
Sold out isn't final, and neither is not-on-sale-yet. Get pinged when either changes.
```

## Category

`Productivity` — not Shopping. The extension does not transact; it watches and notifies.

## Detailed description

```
A big release is never as sold out as it looks.

Cinemas hold seats back — for distributors, for staff, for corporate blocks, for
whoever might still call. When nobody calls, those seats go back on sale. Often in
the last hours before the show, sometimes minutes before it. On an opening weekend
that is frequently the only inventory left.

Nobody announces it. The listing just quietly changes, and by the time you think to
look again the good rows are gone. Refreshing a page every few minutes for three
hours is the manual version of this extension, and it's a bad way to spend an
evening.

The other reason to use it is simpler: you want THAT screen. The IMAX one, the one
with the right rake, the one where the sound is actually set up. The same film in a
worse room isn't the same evening out — so "sold out" there is worth waiting on
rather than settling around.

Both cases have the same shape. You don't want a seat, you want THOSE seats. So pick
the showtimes you care about, say how many seats you need together and where in the
hall you'll accept them, and get a notification the moment a matching block appears.
Click it to land straight on the seat map.

HOW YOU ADD A SHOW

Search BookMyShow the way you normally would — by cinema or by film — and open its
showtimes. Every showtime picks up a small + in its corner. Click it. The film,
format, cinema and start time are filled in for you.

Sold-out showtimes get the button too, and they're the ones worth using it on.

WHEN A FILM ISN'T ON SALE YET

The + needs a showtime to exist before you can click it, and that is its limit: by the
time a first-day show is listed, the seats worth having are often gone.

So the upcoming-movies list gets a bell instead. It attaches to the FILM, not to a
showing, which means you can set it weeks early — before there is anything to book.
Pick the cinemas you would actually go to and you are told which of them opened. Leave
it empty and any cinema counts.

It watches the night before release as well as release day, because premieres, benefit
shows and 1am previews run before a film is officially out — and for a big release those
are often the first tickets on sale. You are told which day opened, and taken to that
day's listing.

Nothing is polled while a release is months away. A watch sleeps until a week before
the release date, which you can change, and is dropped once the film is out.

WHAT COUNTS AS A MATCH

Not just "a seat is free" — the seats you'd actually buy:

• How many free seats side by side, with no aisle between them
• Where in the hall: anywhere, the middle half, or dead centre
• How many rows to skip at the front
• Only the seats BookMyShow marks as its best, if you like

Set them once as defaults, or per show.

HOW OFTEN IT CHECKS

Every show runs on its own clock, so tonight's screening is watched hard while one
next week is barely touched — 90 seconds under three hours to showtime, half an
hour when it's more than a day away. All five intervals are yours to change. A show
is dropped six hours after it has played.

WHERE ALERTS GO

A desktop notification, always. Optionally also to Telegram or to a webhook — a
Discord channel or an ntfy.sh topic both work with a single address pasted in.

Telegram takes as many destinations as you like, and a group counts as one. So one
person can run it and a whole group of friends gets told at once — whoever is free
taps Book now in the alert and goes. Each destination is sent to independently: if the
bot is removed from one group, everyone else still hears about it.

WHAT IT DOESN'T DO

There is no server behind this. Nobody operates a service, so there is nowhere for
your data to be collected or sold. Your watch list and settings live in your own
browser. Checks run in your own Chrome, using the session you're already signed in
with — nothing is proxied, nothing is replayed, and no credentials are handled.

It does not book, hold, or pay for anything. It tells you, and you decide.

ONE THING TO SET UP

Nothing runs while your machine is asleep — and the release you're waiting for tends
to land late in the evening, exactly when a laptop has nodded off. Stop it sleeping
for the evening, and keep the display on: on a Mac, "caffeinate -dis" in Terminal;
on Windows, Settings > System > Power & battery > Screen and sleep > Never. The
welcome page and the settings page both walk through it.

Watching for a film to go on sale is the same problem stretched over days rather than
hours, so it is worth knowing that it does not need the display on — only Chrome
running. And if you are alerting a group, the simplest insurance is two of you running
it into the same group. One machine sleeping then costs nobody anything.

Reading the seat map means loading the seat map, so Chrome needs to be running for
checks to happen. Checks are spaced out and randomly jittered, and never run faster
than once a minute.

NEW IN THIS VERSION

• A film released in several languages now alerts you per language. The Malayalam,
  Telugu and Hindi listings of one film are three separate bookings on BookMyShow,
  and each one now gets its own alert and its own link.
• Rows. Name the rows you'd actually sit in — "F-K", or "H, J" — and only those
  count. Ranges follow the hall's own row order, so a hall that skips row I means
  what you meant.

EARLIER

• Watch a film that isn't on sale yet, and get told the moment booking opens —
  including premieres and previews the night before release.
• Choose which cinemas count, and the alert names the one that opened.
• Telegram alerts can go to several destinations, and a group counts as one, so
  one person can run it for a whole group of friends.

Not affiliated with, endorsed by, or connected to BookMyShow.
```

The changelog goes at the **end**, not the top. The store folds the description after a
couple of lines, and those lines are read almost entirely by people who do not have the
extension yet — spending them on "what changed" serves the smaller audience at the cost
of the larger one. It is here for anyone who scrolls, and nothing more is expected of it:
an existing user is far more likely to see the in-product notice than to revisit this
page.

## Single purpose

The form asks for one sentence, and rejects listings whose stated purpose is plural.

```
Watches BookMyShow listings the user has chosen and notifies them when tickets they
are waiting for become bookable.
```

Note the wording. There are now two things it watches — a showtime's seat map, and a
film that has not gone on sale — and a purpose written as "either A or B" reads as two
purposes and gets bounced. One purpose, two triggers: *tell the user when the tickets
they want become bookable.*

---

## Permission justifications

One box per permission. Each answer should say what breaks without it.

**Each field is capped at 1000 characters**, and the summary at 132. Note that all three
host permissions share **one** box, so the cap applies to them combined — written
separately they came to 1307 and would have been rejected. The lengths are asserted in
`verify.mjs`, so an edit that overruns fails there rather than at submission, which
matters because the store rejects it *after* the review wait rather than during it.

**`alarms`**
```
Checks are spread over hours and must survive the service worker being suspended.
chrome.alarms is the only scheduler that persists across those suspensions.
```

**`storage`**
```
Stores the user's watch lists on their own machine so the extension remembers
them between sessions: the showtimes they chose to watch, the films they chose
to be told about when booking opens, their city and the cinemas they picked in
it, their seat criteria, and their check intervals. Also caches that city's
cinema list so the settings page can show it without fetching it again. Nothing
is transmitted anywhere.
```

**`scripting`**
```
Seat availability is drawn to a canvas element and exists nowhere in the page's
HTML or in any JSON response. The only way to read which seats are free is to run
a reader in the page and measure the canvas. This is also how the + button is
placed on each showtime. Watching for a film to go on sale needs none of this —
it reads public listings directly — so this permission is used only for the seat
half of the extension.
```

**`notifications`**
```
The alert itself. A released block of seats is gone in minutes, so the user has to
be told at the moment it is found rather than the next time they open the popup.
```

**Host permissions — one field for all three**

The form has a single box for host permissions, not one per host, so all
three go in together and the 1000-character cap applies to the total. This is
994.

```
in.bookmyshow.com is the site being watched. Everything read comes from it: showtimes and
seat layouts for a showing the user chose, and — for a film not on sale yet — that city's
cinema list and the per-cinema showtimes that reveal when booking opens. The buttons used
to start a watch are added to its pages.

The content scripts match the whole origin, not a few paths, because BookMyShow is a
single-page app: a script is injected once, against the loading URL, and navigation after
that is pushState with no load. Matching only listing pages meant arriving elsewhere and
clicking through gave no buttons until a reload. They do nothing on pages they do not
recognise.

api.telegram.org is optional, and delivers alerts to a Telegram bot the user creates. The
extension works fully without it.

The optional https://*/* is never requested up front: if the user pastes a webhook address,
Chrome asks for that one address at that moment. It is broad only because a webhook can be
on any host.
```

**Remote code**: No. Everything executed ships in the package. There is no `eval`,
no remotely-hosted script, and the MV3 content security policy is not relaxed.

---

## Privacy practices

Tick exactly these under "What user data do you plan to collect":

| Category | Collected | Why |
|---|---|---|
| Personally identifiable information | **No** | |
| Health information | **No** | |
| Financial and payment information | **No** | |
| Authentication information | **No** | The user's existing session is used in place; no credential is read, stored, or sent. |
| Personal communications | **No** | |
| Location | **No** | The city is read from BookMyShow's own region cookie, and the user can change it in settings. It is stored locally so the extension knows which city's cinemas to offer, and is never sent anywhere. Nothing finer than a city is read — no coordinates, no device location API. |
| Web history | **No** | Only the showtimes and films the user explicitly chose to watch, held locally. No browsing is observed — the `tabs` permission is not requested, and no tab's address or title is ever read. |
| User activity | **No** | |
| Website content | **No** | Seat counts, and which cinemas are selling a film, are read and held locally. No page content leaves the machine. |

Then certify all three:

- Not being sold to third parties ✅
- Not being used or transferred for purposes unrelated to the item's single purpose ✅
- Not being used or transferred to determine creditworthiness or for lending ✅

**Privacy policy URL** — required, and it must be a public web address; the copy that ships
inside the extension does not count. `docs/privacy.html` is the same policy as a single
self-contained file, ready to host as-is. With GitHub Pages pointed at `main` / `/docs`
(see *Hosting the privacy policy* in the README) the URL is:

```
https://<you>.github.io/<repo>/privacy.html
```

---

## Assets

| Asset | Size | Status |
|---|---|---|
| Store icon | 128×128 | `icon128.png` ✅ |
| Screenshot 1 — everything you're waiting on | 1280×800 | `store/screenshot-1.png` ✅ |
| Screenshot 2 — tell me when booking opens | 1280×800 | `store/screenshot-2.png` ✅ |
| Screenshot 3 — your cinemas | 1280×800 | `store/screenshot-3.png` ✅ |
| Screenshot 4 — one person runs it, the group is told | 1280×800 | `store/screenshot-4.png` ✅ |
| Screenshot 5 — the buttons on a real BookMyShow page | 1280×800 | **yours to capture** |
| Small promo tile | 440×280 | `store/promo-440x280.png` ✅ |
| Marquee | 1400×560 | optional, skip |

### Rebuilding them

```sh
sh store/shots/build.sh
```

Every screenshot is the real interface — `popup.html` and `options.html` rendered by
their own code — framed with a headline. **The data in them is invented**: films, seat
numbers, prices and cinema names, because an empty popup shows nothing and a real one
would show whatever happened to be on that day. The interface around the data is exactly
what ships.

Two things the build gets right that hand-composed shots did not:

- **A fixed clock.** The stub anchors `Date.now` to a date near the fixture's own, so
  "checked 2m ago" and "starts checking tomorrow" mean the same thing on every rebuild.
  It anchors rather than freezes — the hall and the trend line are drawn by an animation
  that reads the clock, and a frozen one renders an empty canvas.
- **Scrolling to named elements**, not pixel offsets. The settings tab bar is sticky and
  covers the top of the frame; an offset has to guess by how much, and three of these
  were cropped through the middle of a field before that was fixed.

This matters because the old screenshots went stale silently: two of them showed a
settings page from before it had tabs, and nothing showed them being wrong. Re-run the
build whenever the interface changes.

### The one nobody can render for you

**The buttons sitting on a real BookMyShow listing** — the `+` on a showtime, or the 🔔 on
the upcoming-movies list. That is the shot that sells the extension, and it has to be a
live capture at 1280×800. Using BookMyShow's pages and marks in your listing is your call
to make; the description carries a "not affiliated" line, which is the usual way this is
handled, but it is not legal advice.

---

## Publishing, in order

### 1. Get a developer account — do this first, it has a wait in it

<https://chrome.google.com/webstore/devconsole>. A **one-time US$5** registration fee,
non-refundable, card required. The Google account must have **2-Step Verification turned
on** or the console won't let you publish, and new accounts have to verify their email
before the first submission clears. None of this is hard, but it is the part that can
stall you for a day, so start it before you need it.

Decide now whether to publish under your own name or a group — the publisher name is shown
on the listing and changing it later means a new account.

### 2. Put the privacy policy somewhere public

The form will not accept a submission without a URL, and it must resolve. `docs/privacy.html`
is self-contained and ready; see *Hosting the privacy policy* in the README for the GitHub
Pages route. Open the URL in a private window before you paste it — a 404 here fails review
for a reason that has nothing to do with your code.

### 3. Build the package

```sh
zip -r seat-watch-1.4.2.zip . \
  -x '.*' -x '__MACOSX*' -x 'verify.mjs' -x 'store/*' -x 'icons/*' \
  -x 'docs/*' -x 'probes/*' -x 'promo/*' -x 'video/*' -x 'package.json' \
  -x 'README.md' -x '*.zip' -x '.DS_Store' -x '*/.DS_Store'
```

`package.json` exists only so Node can import `release.js` in the tests; Chrome ignores
it, and it has no business in the package. `probes/` and `promo/` are working material.
**`video/` matters most of the four** — it carries a `node_modules` with a headless Chrome
in it, so forgetting that exclusion turns a 116 KB upload into a rejected one. Preflight
checks for it rather than trusting this line to stay current.

Everything else at the root ships — including `release.js` and `content-release.js`,
which the manifest and the service worker both need.

`manifest.json` must be at the **root** of the archive — zip the contents, never the folder.
Check with `unzip -l`. Bump `version` in the manifest for every re-upload; the store rejects
the same version twice, and this is the single most common reason a resubmission bounces.

### 3b. Check the package before uploading

```sh
node store/preflight.mjs
```

`verify.mjs` tests the source; this tests the archive that actually gets uploaded, which
is a different question and the one that has bounced submissions: a file the manifest
needs but the zip excluded, a stray development file, a version already published. It
also checks the module the service worker imports — that one is named nowhere in the
manifest, so nothing else would notice it missing, and a missing import is a dead worker
with no error.

### 4. Create the item and upload

**Add new item → upload the zip.** The console parses the manifest and creates a draft. If
it rejects the zip outright it is almost always the root-folder mistake above.

### 5. Store listing tab

Everything for this is in the fenced blocks earlier in this file: name, summary, detailed
description, category (`Productivity`), and language (English). Upload `icon128.png`, the
three screenshots and the promo tile from `store/`.

Lead with the screenshot that shows the + on a real BookMyShow listing once you have it —
the first screenshot is what people judge the extension on.

### 6. Privacy tab

The one that takes the longest, and all of it is written above:

- **Single purpose** — one sentence, and it must read as singular.
- **Permission justifications** — one box per permission. Paste each block as-is.
- **Data usage** — the nine categories, all No, plus the three certifications.
- **Privacy policy URL** — from step 2.
- **Remote code** — No.

### 7. Distribution tab

Visibility **Public**. Regions are worth a thought rather than a default: this only works
on `in.bookmyshow.com`, so India is the whole audience. Listing everywhere costs nothing
and occasionally finds someone abroad booking ahead of a trip; restricting to India keeps
the install base honest. Either is defensible — just pick deliberately.

### 8. Submit, then wait

Review is typically a few days. Anything asking for `scripting` plus a broad optional host
permission gets looked at properly, so budget longer than the optimistic case and don't
plan a launch around a date.

If a reviewer writes back, the justification blocks above are written to be pasted into a
reply as-is. The two questions to expect: *why does this need `scripting`* — because seat
availability is only ever drawn to a canvas and exists in no HTML or JSON — and *why the
broad optional host permission* — because a webhook can be on any host, it is never
requested up front, and Chrome asks per address at the moment one is pasted.

### Updating an existing listing — what actually needs touching

This is an update, not a first submission, so most of the form is already filled in.

#### 1.4.2 — the current one

| Field | Why |
|---|---|
| **Package** | `seat-watch-1.4.2.zip` |
| **Description** | Add the two fix lines below to the changelog |
| **Everything else** | Unchanged |

Bug fixes found by running 1.4.1 against a real release week. No new permission,
no new content script, no new host.

- **A watch could alert for the wrong film.** A film's identity is its EventGroup, and
  that group is read off the film's own page. A fetch that answered with something else —
  a redirected address, a listing page — handed the watch another film's group, and the
  watch then alerted for that film, in every language, under the right film's name. The
  page is now checked to be the film's own before anything is believed of it, and a
  listing whose address disagrees with the watch's is refused even if the group matches.
- **Premiere dates read the wrong day.** BookMyShow answers a date it has no showtimes
  for with the day it does have, unflagged. A premiere watch asks about exactly such a
  date on every check, so that evening's listings were being read as the premiere's.
  Rows are now kept only if they carry the date that was asked for.
- **Desktop alerts say when they fail.** Both notification calls read Chrome's error only
  to discard it, so a refused notification left no trace. Settings → Alerts now has a
  test button that distinguishes Chrome refusing, the OS suppressing, and it working.

#### 1.4.1 — what it fixed

| Field | Why |
|---|---|
| **Package** | `seat-watch-1.4.1.zip` |
| **Description** | The two 1.4.0 lines stay; add the fix line below to the changelog |
| **Screenshots** | The settings shot pictures the old "Nearest fifth" dropdown. Rebuild `store/shots` before uploading, or leave it — it is a dropdown, not a claim about what the extension does |
| **Everything else** | Unchanged |

A bug-fix release on top of 1.4.0, which was still in review when these were found. No
new permission, no new content script, no new host — nothing that needs a fresh
justification.

What changed:

- **Saving settings no longer deletes shows.** The page read its cards once, at load, and
  wrote them back over the whole list — so a show added from the popup or from
  BookMyShow after the page was opened was deleted by a save that only meant to change a
  cadence. Saves now merge against what is stored, and a show added elsewhere appears in
  the list without a reload.
- **"Rows to skip at the front" counts rows.** It was a fraction of the hall — nearest
  fifth, nearest third, front half — which is not how anyone thinks about it, and the
  same fraction meant a different number of rows in every screen. It now reads "the first
  3 rows". Settings saved with the old fractions keep working and convert on first open.

#### 1.4.0 — submitted, in review when 1.4.1 was cut

| Field | Why |
|---|---|
| **Package** | `seat-watch-1.4.0.zip` |
| **Description** | One line on each of the two changes, at the changelog at the end |
| **Everything else** | Unchanged |

A quiet update by store standards: no new permission, no new content script, no new host.
Both changes are refinements of what 1.3.0 already did, so expect a patch-speed review
rather than the slow one 1.3.0 got.

What changed, in the words the changelog uses:

- **A film out in several languages alerts per language.** Malayalam, Telugu and Hindi are
  three listings of one film with three different event codes, and 1.3.0 folded them into
  a single alert linking to whichever one you happened to add. Each language now gets its
  own alert, its own link, and — where theatres are picked — the cinema it opened at.
- **Rows.** Name the rows you'd actually sit in (`F-K`, `H, J`) and only those count. Ranges
  follow the hall's own row order, so a hall that skips I means what you meant.

#### 1.3.0 — what that update needed, kept for reference

| Field | Why |
|---|---|
| **Package** | `seat-watch-1.3.0.zip` |
| **Summary** | Rewritten — the old one described seats only |
| **Description** | Release watching, premieres, group alerts, and a short changelog at the end |
| **Single purpose** | Rewritten. "Either seats or films" reads as two purposes and gets rejected; it is now one purpose with two triggers |
| **Screenshots** | All four replaced. Two of the old three showed a settings page from before it had tabs |
| **Permission justifications** | `storage`, `scripting` and the BookMyShow host permission |
| **Privacy policy URL** | Unchanged, but **re-publish `docs/privacy.html`** — the hosted copy is generated and the old one no longer matches the code |

Unchanged across both: name, category, the permissions themselves, the promo tile, and
every privacy answer (all still "No").

### After it's live

- The item ID is permanent. It cannot be reused for a different extension, so don't create
  the item to "have a look" and then decide to start again.
- Every update is a new version number and another review, including trivial ones.
- Reviews and support requests arrive by email to the developer account. There is no
  backend and no support address in the extension, so that inbox is the only channel.
