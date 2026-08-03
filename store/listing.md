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
this is 89. It doesn't repeat "BookMyShow" — the name directly above it already said that,
and the space is better spent on what the thing does.

```
Sold out isn't final. Get pinged the moment a block of seats together opens up on a show.
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

Reading the seat map means loading the seat map, so Chrome needs to be running for
checks to happen. Checks are spaced out and randomly jittered, and never run faster
than once a minute.

Not affiliated with, endorsed by, or connected to BookMyShow.
```

## Single purpose

The form asks for one sentence, and rejects listings whose stated purpose is plural.

```
Monitors BookMyShow seat-layout pages the user has chosen and notifies them when a
block of adjacent free seats matching their criteria becomes available.
```

---

## Permission justifications

One box per permission. Each answer should say what breaks without it.

**`alarms`**
```
Checks are spread over hours and must survive the service worker being suspended.
chrome.alarms is the only scheduler that persists across those suspensions.
```

**`storage`**
```
Stores the user's watch list, their seat criteria, and their check intervals on
their own machine so the extension remembers them between sessions. Nothing is
transmitted anywhere.
```

**`scripting`**
```
Seat availability is drawn to a canvas element and exists nowhere in the page's
HTML or in any JSON response. The only way to read which seats are free is to run
a reader in the page and measure the canvas. This is also how the + button is
placed on each showtime.
```

**`notifications`**
```
The alert itself. A released block of seats is gone in minutes, so the user has to
be told at the moment it is found rather than the next time they open the popup.
```

**Host permission — `https://in.bookmyshow.com/*`**
```
The site being watched. Showtimes and seat layouts are both read from this origin,
and the + button is added to its listing pages.
```

**Host permission — `https://api.telegram.org/*`**
```
Optional. Delivers alerts to a Telegram bot the user creates themselves, when they
choose to set one up. The extension is fully functional without it.
```

**Optional host permission — `https://*/*`**
```
Optional and never requested up front. If the user pastes a webhook address for
alerts, Chrome asks permission for that one address at that moment. The pattern is
broad only because a webhook can be on any host; permission is granted per address
by the user, and none is held unless a webhook is configured.
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
| Location | **No** | The city is read from BookMyShow's own region cookie to build a request, and never stored or sent anywhere. |
| Web history | **No** | Only the seat-layout addresses the user explicitly added, held locally. |
| User activity | **No** | |
| Website content | **No** | Seat counts are read and held locally; no page content leaves the machine. |

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
| Screenshot 1 — the popup | 1280×800 | `store/screenshot-1.png` ✅ |
| Screenshot 2 — adding a show | 1280×800 | `store/screenshot-2.png` ✅ |
| Screenshot 3 — the criteria | 1280×800 | `store/screenshot-3.png` ✅ |
| Small promo tile | 440×280 | `store/promo-440x280.png` ✅ |
| Marquee | 1400×560 | optional, skip |

All three screenshots are the real interface — `popup.html` and `options.html` rendered
by their own code — but **the data in screenshot 1 is made up**: invented shows, seat
counts and prices, because a screenshot needs a populated popup and an empty one shows
nothing. Screenshots 2 and 3 are the settings page as it actually ships. Replace
screenshot 1 with a live capture when you have a real alert on screen; it will be more
convincing than anything that can be staged.

**The screenshot that sells this extension is the one nobody can render for you**: the +
buttons sitting on a real BookMyShow listing. Capture it live at 1280×800 and lead with
it. Note that using BookMyShow's pages and marks in your listing is your call to make —
the description already carries a "not affiliated" line, which is the usual way this is
handled, but it is not legal advice.

Rebuild any of these from `icons/build.sh` (the icons) or by re-running the renders; the
screenshots are compositions, so keep the PNGs rather than expecting to regenerate them.

---

## Before you submit

- **Bump the version** in `manifest.json` for every re-upload — the store rejects the same
  version twice. Currently `1.2.0`.
- **Host the privacy policy** and paste the URL (see above). The file is ready; it just
  needs somewhere to live.
- **Zip the folder, not the parent.** `manifest.json` must be at the root of the
  archive. Exclude `verify.mjs`, `store/`, `icons/` and `README.md` — none of them
  are loaded at runtime, and review is faster with less to look at.

```sh
zip -r bms-seat-watch.zip . \
  -x '.*' -x '__MACOSX*' -x 'verify.mjs' -x 'store/*' -x 'icons/*' -x 'docs/*' -x 'README.md'
```

- **Expect questions about `scripting` and the broad optional host permission.** Both
  justifications above are written to be pasted into a reviewer reply as-is.
