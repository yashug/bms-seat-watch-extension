# Seat Watch for BookMyShow

**[Install from the Chrome Web Store →](https://chromewebstore.google.com/detail/seat-watch-for-bookmyshow/hkbeaeicmbnldhgfkoonkkebdlphnohn)** · free, no account, no server

[**Watch the demo →**](https://www.youtube.com/watch?v=PXEYwPYnXAc) · 60 seconds

Watches BookMyShow seat-layout pages from inside your own logged-in Chrome and tells you
when a block of adjacent seats opens up — the blocked-inventory releases that tend to land
1–3 hours before showtime.

Alerts arrive as a desktop notification you can click straight through to the seats, and
optionally to a webhook or Telegram.

## Why this exists

A big release is never as sold out as it looks. Cinemas hold seats back — for
distributors, for staff, for corporate blocks, for whoever might still call — and when
nobody calls, those seats go back on sale. Often in the last hours before the show,
sometimes minutes before it. On an opening weekend that can be the only inventory left.

Nobody announces it. The listing just quietly changes, and by the time you think to look
again the good rows are gone. Refreshing a page every few minutes for three hours is the
manual version of this extension, and it is a bad way to spend an evening.

The second reason is simpler and just as common: **you want that screen.** The IMAX one,
the one with the right rake, the one where the sound is actually set up. A ticket to the
same film in a worse room isn't the same evening out, so "sold out" there is worth waiting
on rather than settling around.

Both cases have the same shape — you don't want *a* seat, you want *those* seats — which is
why the filters are about size and position rather than mere availability.

## Install

**[From the Chrome Web Store](https://chromewebstore.google.com/detail/seat-watch-for-bookmyshow/hkbeaeicmbnldhgfkoonkkebdlphnohn)** — then pin it, so you can see the badge.

### From source

For working on it, or for running a version ahead of what the store has approved:

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and pick this folder
4. Pin the extension so you can see the badge

No build step, no npm, nothing to compile.

## Alerts on your phone (optional)

### Telling a group of friends

A Telegram chat id is a group as readily as a person, so one machine can watch
and everyone hears about it. Put as many destinations in the field as you like,
separated by commas — a group and your own chat, or two groups. Each is sent to
independently: a group somebody removed the bot from fails on its own rather
than taking the alert down for everyone still in it, and the failure is reported
rather than swallowed.

Every alert carries a tappable **Book now** button straight to the seat map or
the booking page, because on a phone, in a group, one tap beats finding a link
in a paragraph.

To add a group: create it, add your bot, then send `/start@yourbotname` in it.
That last step is the one people miss — a bot cannot read ordinary group
chatter, so the group stays invisible to **Find mine** until the bot is
addressed directly. Group ids are negative, like `-1001234567890`; the minus
sign is normal.

Worth knowing before you set this up: everyone is told at the same moment and
anyone can act on it. For a first-day scramble that can mean your friends racing
each other for the same seats.

Desktop notifications work on their own. For anything more, Settings offers two routes:

**A webhook** — one address, no bot to create. A Discord channel webhook or an
`ntfy.sh` topic both work as-is; anything else receives plain JSON with the title and
text kept separate. Chrome asks permission for that specific address the first time,
so the extension never holds blanket network access it isn't using.

**Telegram** — more setup, most dependable once running:

1. Message **@BotFather**, send `/newbot`, copy the token it replies with
2. Send your new bot any message — Telegram won't let it write to you first
3. Click **Find mine** and the chat ID fills itself in
4. **Send a test message**

## Adding shows

Search on BookMyShow either way round — **by cinema** or **by film** — and open its
showtimes. Every showtime on the page picks up a small **+** in its corner. Click it and
that show goes on the watch list, with its film, format, cinema and start time already
filled in; click the **✓** to take it off.

Showtimes that BookMyShow shows as sold out get the button too, and they're the ones worth
using it on. A greyed-out chip is exactly the show whose blocked seats may be released
later — and the listing's own sold-out flag is not to be believed anyway (see
[below](#why-availstatus-is-never-trusted)).

### The two listings

They are mirror images, and each needs its own handling.

**By cinema** — one venue, many films. Rows are films, and the venue is in the address:

```
/cinemas/HYD/allu-cinemas-kokapet/buytickets/ALUC/20260802
         ^region                            ^venue ^date
→ /api/v3/mobile/showtimes/byvenue?dateCode=20260802&venueCode=ALUC&regionCode=HYD
```

**By film** — one film, many venues. Rows are cinemas, so the venue code has to come from
the data, per showtime:

```
/movies/hyderabad/spider-man-brand-new-day/buytickets/ET00505091/20260802?etCodes=*&language=english
        ^region                                      ^film       ^date
→ /api/movies-data/v5/showtimes-by-event/primary-dynamic?etCodes=*&dateCode=20260802&regionCode=HYD&…
```

**The first scan makes no request at all.** BookMyShow renders the film page with that
same response already inside it, at
`__INITIAL_STATE__.showtimesFunctionalApi.queries["fetchPrimaryDynamic-…"].data` — the
identical envelope, so the same parser reads it. It's free, it's there before the endpoint
would have answered, and it's one fewer request against a site with bot detection. The
endpoint is only used for a date the page wasn't rendered for.

That branch is reached by explicit key path, never by walking. The same state object holds
the signed-in member's name, email, mobile and session token; going straight to one branch
means the code never passes near them.

**Changing the date.** The listing re-renders and the chips are replaced. So the showtimes
are read *before* the chips are found, never after — reading takes a moment, the app
finishes rendering while the extension waits, and buttons hung on the chips captured
earlier would be attached to elements no longer on the page. Each button also records the
day it belongs to, so a chip the app reuses gets rebound rather than keeping yesterday's.

**Where the request comes from.** You usually reach a film's listing by clicking *Book
tickets*, which is a route change: no reload, so no fresh page state, and the new URL need
not carry the language or format the endpoint is keyed on. Rebuilding a request from that
URL asks the wrong question and comes back with nothing.

So the request is assembled from two sources, and which one wins per parameter is the
point. The **address bar** says which listing is on screen — film, format, language — and
is rewritten on every route change, so it is never stale. The **page's last request**,
taken from its own resource timing (or, on a fresh load, from the arguments in the page
state), says how this browser asks: the app code, the member and session ids, none of
which a URL carries.

The address bar decides what to ask about; the prior request fills in the rest. Getting
that precedence backwards is not a small error — the app keeps a cached request per format
and date and never discards the old ones, so a stale one asks for a listing nobody is
looking at and the endpoint answers `400`.

Nothing is intercepted and nothing is replayed; only same-origin entries are considered, so
the address is always on the page's own host. Both sources read the page's own request
rather than the cookie those member details live in, which nothing here touches.

**Which date, though.** Changing the date re-renders the chips without necessarily
rewriting the URL, and binding chips from one day to sessions from another would be wrong
in a way nobody could see. So the date comes from the page: each date pill carries its own
code as an `id`, and the selected one is the only one with a filled background — a property
of what "selected" means, not of a class name that changes every deploy. When the pill and
the URL disagree, the pill wins.

The response itself is parsed by hand rather than by matching key names, because the two
identifiers a seat-layout address needs sit in `additionalData` objects that are *siblings*
of the showtimes rather than ancestors:

```
showtimeWidgets[] → data[] → venue-card
  additionalData.venueCode                    the cinema
  showtimesSections[]
    additionalData.eventCode                  the film, per format
    text[0].components[0].text                "English DOLBY CINEMA 3D"
    showtimes[]
      additionalData.sessionId, showTime, showTimeCode, showDateCode, availStatus
```

A walk that carries context downward can never reach either, so every showtime would come
out unattributed. There's a test asserting the generic walk finds nothing here — it's the
reason the hand-written parser exists.

Two details that bite. The region is a **code** on one address and a **slug** on the other
— both work in a seat-layout URL, so it's passed straight through, but the film endpoint
insists on the code, which is read from BookMyShow's own `rgn` cookie. And `etCodes`,
`language` and `refEventCode` are copied off the page's own address rather than invented,
so the extension asks for exactly what the page is showing.

Either way the answer is the same, and the address is assembled rather than scraped:

```
https://in.bookmyshow.com/movies/HYD/seat-layout/ET00502689/ALUC/3024/20260802
```

Both endpoint paths are host-relative, so the requests are same-origin by construction and
need no permission beyond the one the extension already has.

You can still paste a seat-layout URL into Settings by hand.

## Watching for a release

The `+` needs a showtime to exist before you can click it, and that is the problem
it cannot solve: by the time a first-day show is listed, the seats worth having
are often gone. A release watch attaches to a *film* instead of a showing, so it
can be set weeks earlier — on the upcoming list, where there is nothing to book
yet.

Every film on `bookmyshow.com/explore/upcoming-movies-<city>` picks up a bell.

Both this and the `+` are injected across the whole of `in.bookmyshow.com`
rather than only on listing pages, and do nothing on pages they do not
recognise. That is not thoroughness for its own sake: a content script is
injected once, against the URL its document loaded with, and every click inside
BookMyShow after that is a `pushState` with no load. Matching only listings
meant that arriving anywhere else and clicking through produced no buttons at
all until you reloaded. It grants no extra access — the host permission already
covers the whole site — and the install-time warning is unchanged.
Click it and the film lands in **Settings → Release watch**.

### Pick your theatres

This is the difference between a good alert and a vague one, and it is worth two
minutes.

**With theatres chosen**, each check asks BookMyShow's own per-cinema listing
what is playing at exactly those cinemas on release day, and matches on the
film's `EventGroup`. That comparison is exact. When it fires, it names the
cinema that opened.

Each watched film keeps its own theatres. The **Choosing for** control above the
list points the picker at either *New films* — what a newly belled film starts
with — or at one film you are already watching, so changing one leaves the others
and the default alone. Only films watched in the city on screen are offered:
venue codes mean nothing outside their own city, so a Hyderabad cinema list
cannot say anything useful about a film being watched in Mumbai. Switch city and
that film becomes editable, alongside its own cinemas.

Your choice is remembered **per city**. Venue codes only mean anything inside
their own city, so switching city shows that city's cinemas and its own picks —
and switching back brings yours with it. Looking at another city never costs you
the selection you were setting up, and saving writes them all.

**With none chosen**, there is no such call available — the film-wide endpoint
refuses every request the extension can construct (see `probes/FINDINGS.md`), so
the check falls back to reading the film's own page and looking for "Book
tickets". That tells you booking opened *somewhere in your city* and nothing
more. It also leans on wording BookMyShow can change at any time, so it is
reported in three states rather than two: open, not yet, and **can't tell**. The
last one never fires an alert and shows as a warning in the popup, because a
detector that quietly reads "no" would leave a watch silent through the exact
moment it exists for.

### Why it matches on a group, not a film code

One film has several event codes. *Irumudi* has three, all Telugu:
`ET00487933`, `ET00513073`, `ET00513087`. Which of them goes on sale is not
knowable in advance, so a watch bound to the code that happened to be on the card
you clicked would miss the others — silently, and in a way indistinguishable from
the film simply never opening.

Every one of them carries the same `EventGroup`, and so does the card on the
upcoming list. That is what a watch stores, and the match is exact string
equality with no normalising, no title comparison, and no guessing.

The listing page only carries state for the films it rendered on the server, so
a film further down the list reaches the bell with no group. The watch is then
completed from the film's own page — at the moment it is added, and on later
checks if that first attempt failed. Five tries, then it gives up and says so:
a watch matching on a single event code still works, but it can miss the
language or format that actually goes on sale, and that is worth knowing rather
than discovering afterwards.

### Premieres and preview shows

A film's first showings are often not on its release date. Premieres, benefit shows,
paid previews and 1am screenings run the night before — and for a big release they are
frequently the **first** thing to go on sale and the thing people most want.

So a watch asks about the night before release as well as release day. That is one extra
request per cinema per check, which is why it is one night by default rather than a
window; **Also watch _n_ nights before release** in Settings changes it, and 0 turns it
off.

Two consequences worth knowing. A premiere opening and release day opening are separate
events, so you get told about each — the alert says which, and leads to that day's
listing rather than always to release day. And a watch now wakes before its earliest
premiere rather than before release day, so a short dormancy setting cannot sleep
straight through the premiere.

### How often, and when it starts

One flat interval, ten minutes by default, set in Settings. Unlike seat checks
there are no bands: booking does not open on a schedule that a cadence table
could anticipate.

A watch stays **dormant until seven days before release** — also configurable. A
film three months out, checked every ten minutes, is about thirteen thousand
requests before the first one could possibly matter. Sleeping until the release
is in sight costs nothing, because booking does not open months ahead. A film
whose release date could not be read is never held back: not knowing when it
opens is a reason to start early, not late.

A watch is dropped once its release date is a day behind, whether or not it ever
fired.

### What it costs

Release checks run in the service worker as plain `fetch`, with
`credentials: 'omit'`. They open no tab, need no visible window, and carry
nothing that identifies you — the per-cinema listing was measured returning
byte-identical responses with and without a session. None of the watcher-window
machinery below applies to them; that is only for seat maps, which need a
rendered canvas.

Nothing here is shared with the seat watcher except the alert channels. Pausing
the extension pauses both.

## What counts as a block worth telling you about

Per show, or as defaults for all of them:

| | |
|---|---|
| **Seats together** | how many free seats side by side, with no aisle between them |
| **Where in the hall** | anywhere, the middle half, or dead centre |
| **Rows to skip at the front** | the nearest fifth, third, or half |
| **Bestseller seats only** | the ones BookMyShow marks as its best, at no extra cost |

Position is the filter that decides whether an alert is worth acting on. Four free seats
in the front corner and four dead centre are the same row length and the same price, and
only one of them is worth leaving the house for.

Both position filters come from the rendered layout rather than from seat numbers, which
can't be trusted for this — numbering runs in different directions in different halls and
row letters skip I. Internally they're fractions of the hall: `offCentre` 0 is dead middle
and 1 is hard against a side wall, `fromScreen` 0 is the front row and 1 the back. That
second one inverts the row index on purpose, because BookMyShow draws the screen at the
*bottom* of the layout, so the largest y is the row nearest it.

### Matching a button to a showtime

The response nests two levels that matter:

```
ShowDetails[] → Event[]        one film, one poster on the listing
                └ ChildEvents[]   one bookable version of it — its own EventCode
                   └ ShowTimes[]     SessionId, ShowTime, AvailStatus, ScreenName, MinPrice
```

The film is an `Event`; what you actually book is a `ChildEvent`. Spider-Man in Dolby 3D
English and in Telugu 2D are different child events with different event codes, and they
appear as separate rows. Getting a button onto the right chip means resolving to the child
event, not the film.

Chips are found by matching the text and keeping the innermost hit, not by looking for a
leaf. A show with subtitles puts an **ENG** badge *inside* the time element, and requiring a
leaf made every one of those chips invisible. The badge also abuts the time in the DOM —
the gap you see is CSS margin — so `10:00 PMENG` has no word boundary after the meridiem
and must not be required to. Two clock times in one element means a range, which is a
filter control rather than a showtime, and is rejected.

Start time settles most chips. When it doesn't, the row's text does — and what the row
says depends on which listing you're on. On a cinema's page it names the **film**, its
language and its format; on a film's page it names the **cinema**. Both are tried, since
only one of them is ever present.

The format test takes the **longest** match, because `DOLBY CINEMA 3D` contains `3D`; a
plain substring test would leave the Dolby row permanently ambiguous with the ordinary 3D
row.

**One cinema can run the same film at the same minute on two screens.** Aparna Nallagandla
does exactly that — two 11:10 PM showings, same format, same attributes, different
sessions. Nothing printed on the page separates them, so the last tie-break is order: the
page lists them in the order the endpoint returned, and each chip *claims* its session so
the next one takes the next. A chip with nothing left to claim gets no button rather than
a duplicate of one already on the page.

If a chip still can't be resolved, no button appears, rather than one that would watch the
wrong screen.

### Why `AvailStatus` is never trusted

The showtimes response carries an `AvailStatus` per show, and `0` is the greyed-out chip.
It is used for one thing only: the button's wording, which says *"Listed as sold out —
watch anyway, seats are often released late."* Note the phrasing. It attributes the claim
to BookMyShow rather than repeating it, because the claim is not reliable.

**Observed on the live site: a show reporting `AvailStatus: 0` can have free seats on its
layout page.** The status appears to be computed on some interval rather than read live,
so it lags. It lags hardest during a late release of blocked inventory — which is the one
event this entire extension exists to catch.

That makes the obvious optimisation actively harmful. Polling the cheap JSON endpoint and
only opening the seat map when the status moves off `0` would cut traffic substantially and
would go silent at exactly the moment it was built to fire. Availability is decided by the
Konva scene graph on the seat-layout page, every time, with no shortcut in front of it.

Four tests hold that line: a show listed sold out is still watchable, flipping every
`AvailStatus` in a response changes nothing about what is offered, `background.js` is
asserted never to contain the string `AvailStatus` at all, and the content script is
asserted to reference it in exactly two places — both wording.

### If the endpoint moves

`readSessions()` in [content.js](content.js) falls back to reading
`window.__INITIAL_STATE__` out of the inline script's *text*, then to asking the service
worker to read the page's JS globals in the MAIN world (a content script can't see globals
from its own world). Field names there are matched loosely (`sessionId`, `session_id`,
`showId`, …) and the walk is shape-agnostic.

The button is hung on whichever ancestor of the time text is *bordered and chip-sized*,
never on a class name — BookMyShow's classes are content hashes like `sc-yr56qh-0` that
change with every deploy.

If no buttons appear, open the console. The extension says which route it took and, if all
three failed, which objects came closest — by path and key name.

### What it doesn't read

On a signed-in page, `__INITIAL_STATE__` also carries `cookies.ud` — your name, email,
mobile number and session token — right alongside the showtimes. The walk does not descend
into `cookies`, `user`, `ud`, `userDetails`, `appConfig`, or the `seo` block at all, so
that data is never read rather than read-and-discarded. A test asserts it, using a getter
that trips if anything touches it.

The same rule keeps the console diagnostic safe: it prints paths and key *names*, never
values, so it can be pasted into a bug report without carrying your account with it.
Skipping `seo` also matters for speed — on this page it's tens of thousands of nodes of
footer links.

## The watcher window — important

**If you already have that seat map open yourself**, in a visible window as its window's
active tab, the extension reads your tab and no window appears at all. The popup says
*"your own tab"* when a check came from one. Otherwise:

Checks run in a small popup window that the extension opens in the bottom-right corner.
**It has to stay on screen.** You can put it behind everything else and ignore it, but
don't minimise it and don't let it be completely covered.

This isn't a preference — BookMyShow only builds the seat canvas when the page is
visible. In a hidden tab, `window.Konva` loads but never creates a stage, and after
~40 seconds Chrome freezes the renderer outright. That's what the "seat layout did not
render in time" error was. The window is created with `focused: false`, so it never
steals your keyboard focus; its tab is simply the active tab of its own window, which is
enough to count as visible.

If checks start timing out, the popup will say *"watcher window is hidden"* rather than
the generic message — that means the window got minimised or fully occluded.

The window is sized 1100×780 and placed inside your focused browser window's rectangle,
which keeps it within the bounds Chrome will accept (it rejects anything more than half
off-screen). On a small or narrow browser window it shrinks to fit. If your browser
window is very narrow, BookMyShow may serve a mobile layout that doesn't use the same
canvas — if that happens, widen your main Chrome window and the watcher follows.

## Using it

The badge shows the number of currently available blocks across all shows — green when
something's open, a grey dot when it's watching quietly.

Click the icon and you get the hall itself, drawn from the seat data the last check read:

- **green, joined by a band** — a run that matched your filters
- **slate blue** — free, but not what you asked for
- **pale grey** — taken

The band is the point: "four together" is one shape, not four green dots that happen to be
near each other, and the eye reads the difference instantly. Aisles show up as real gaps,
because the columns come from the rendered seat pitch rather than seat numbers. Under the map: a live countdown to showtime, the blocks it found by row
and price, and a bar that fills as the next check approaches. **Check now** forces an
immediate pass on every show, including retired ones. **Pause** stops the schedule without
losing your config.

Under the map, a line shows **free seats over time** once there are a few readings — in the
same slate blue the free seats are drawn in. Its x axis is elapsed time, not the check number,
so the points bunch to the right as the cadence tightens near showtime. That bunching is
true and worth seeing, and a release shows up as the line jumping.

**Snooze** quiets one show for 15 minutes without unwatching it — checks continue, and the
blocks it stayed quiet about are still counted as new when the snooze lapses, so nothing
gets silently swallowed. **Stop watching** asks once before removing.

### Clicking the alert

The desktop notification is clickable and carries **Open seats** and **Snooze** buttons.
Clicking it, or **Book now** in the popup, opens that show's seat map in your own window —
never the watcher's, which has to keep its page.

## How often it checks

Every show runs on its own clock, so a screening tonight is watched hard while one next
week is barely touched:

| Time until showtime | Check every |
|---|---|
| more than 24h | 30 min |
| 6–24h | 15 min |
| 3–6h | 5 min |
| **under 3h** | **90 sec** |
| showtime unreadable | 10 min |
| 15 min past start | retires the show |

A retired show stops being checked but stays in the list for **six hours**, so you can
open the popup that evening and see how it went. After that it is removed along with its
history. Nothing about it can change once it has played, and a list that only ever grows
is one you end up clearing out by hand.

**All five intervals are editable in Settings** and are kept for next time. They apply to
every show — the band a show falls into is already decided by its own countdown, so a
per-show ladder would only be a second way to say the same thing.

The under-3h band is the one that matters. Blocked inventory tends to be released in the
last few hours, so that band is what the extension is for; everything above it is just
staying informed cheaply.

Two limits are not editable. Every interval gets up to 15% of random slack and shows are
staggered a couple of seconds apart, so checks never land in lockstep. And **nothing checks
more than once a minute**, whatever the box says — each check is a real page load in a real
browser against a site with bot detection, and a tight loop is what gets an extension
blocked. A value below the floor is clamped on save, so the field shows what will actually
happen rather than what was typed; a blank or nonsensical one falls back to that band's own
default, never to a shared one.

## When it alerts

Once per block, not once per check:

- finds a contiguous run of N+ free seats → alert
- same block still free next check → silent
- a *different* block opens later → alert
- everything rebooks, then reopens → alert again (state clears when availability hits zero)

Adjacency comes from seat coordinates on the canvas, not seat numbers. This matters — on
the screen this was built against, Row R had free seats numbered 24 down to 01 with no
gap in numbering, but they're two separate blocks with an aisle between them.
Number-based logic would have promised you a 24-seat block that doesn't exist.

The threshold is derived per-render from median seat width × 1.5, not hardcoded, because
the layout scales with window size. Measured on the live page: 23px seats on a 28px grid,
with aisles at exact multiples (28 ×592, 56 ×2, 84 ×17, 112 ×17). Width is the right
anchor because — unlike any gap statistic — aisles can't skew it.

Bestseller seats (yellow) are bookable, are counted, and get marked ⭐.

## How it works

The seat map isn't DOM — it's an HTML5 canvas drawn with Konva.js, and the API response
behind it is an AES-encrypted blob, so there's nothing greppable on the wire. The
extension reads Konva's in-memory scene graph, where each seat is a `Group` carrying:

```js
{ seatId: "Seat-D-2-32-04", rowNumber: "L", displaySeatNumber: "32",
  curPrice: "395", seatStatus: 4, seatType: "Best Seat" }
```

`seatStatus`: `1` = available, `2` = booked/held, `4` = bestseller (bookable). Anything
that isn't `2` is free.

Three implementation details worth knowing if you edit this:

- **MAIN-world injection is mandatory.** Content scripts run in an isolated world and
  cannot see page JavaScript, so `window.Konva` reads as `undefined` from a normal
  content script. `background.js` uses `chrome.scripting.executeScript({ world: 'MAIN' })`.
  Drop that flag and everything silently returns null.
- **The page mounts two Konva stages** — a 250×250 one and the real 1208×613 seat stage,
  and the real one isn't reliably last. Taking `Konva.stages.at(-1)` returns zero seats.
  It picks whichever stage actually contains seat nodes.
- **Seat data arrives ~2.5s after hydration**, so the canvas is empty right after load.
  `readSeats()` polls the injection once a second until seat nodes exist, up to 45s,
  rather than trusting the load event.
- **The page must be visible** (see above). Background tabs never mount the canvas.

Checks reuse a single popup window. If you close it, the next check makes a new one.

## Tests

```bash
node verify.mjs
```

422 offline checks: manifest validity, every referenced file exists, all five scripts
parse, the injection contract holds (MAIN world, arg shape, async message channel), the
visibility regression is locked in (popup window, unfocused, never `active: false`), the
window-bounds arithmetic is checked against six screen/window configurations, plus
showtime parsing, the cadence ladder, and the adjacency algorithm against a mock canvas
that includes the decoy stage and is re-run at three different render scales. A page
outlives the extension that injected it — reloading or updating the extension severs the
two — so every crossing of that boundary is required to be guarded or caught, and a
severed click has to explain itself rather than throw, and the buttons it can no longer
act on have to look that way before they are clicked. Shows are required to leave the list
once they have played, and the sweep that does it has to prune storage and the run in
progress together.

The interface is covered too: no inline handlers or remote assets (both blocked by the
MV3 content security policy), reduced motion honoured, focus kept visible, and the three
seat colours the canvas draws with are checked against the CSS tokens they mirror — a
canvas can't read CSS variables, so that pair has to be kept in step by hand.

The hall map has its own set: aisles survive as gaps, every marked cell is genuinely a
free seat, short rows pad to full width, and the grid comes out identical at three render
scales.

So does the Watch button: the seat-layout address it assembles is checked against the real
format and against the validator Settings uses, times normalise from both 12- and 24-hour
notation (including the midday and midnight edges), the harvester carries a movie's event
code down to its showtimes, and a chip whose start time is shared by two movies binds to
the right one — or to nothing at all when the row can't settle it. No browser, no network.

## Privacy

There is no backend. Nobody operates a service behind this, so there is nowhere for your
data to be collected or breached — everything lives in `chrome.storage.local` on your
machine, and uninstalling deletes it. The full statement is in [privacy.html](privacy.html),
linked from Settings and from the first-run page.

Two things worth stating here as well:

- **The `tabs` permission is not requested.** Chrome renders it at install as *"Read your
  browsing history"*, and nothing here needs it — `tabs.get`/`update`/`create` all work
  without it, and the extension never reads a tab's url, title or favicon. A test asserts
  that stays true.
- **Your BookMyShow account details are never read.** They sit in the same page data as
  the showtimes — name, email, mobile, session token — and the code does not descend into
  those branches at all. A test proves it with a value that trips if anything touches it.

## Keep the machine awake

**Nothing runs while the machine sleeps**, and the release you're waiting for tends to land
late in the evening — exactly when a laptop has nodded off. This is the single most common
reason the extension appears to do nothing.

Keep the display on too. Chrome treats a window it believes nobody can see much like a
minimised one, and a dark screen can be enough to trigger that. Plug in first; both
recipes below assume mains power.

**macOS** — run this in Terminal and leave the window open. Ctrl-C ends it, and so does
closing the window, so nothing is left switched on afterwards:

```sh
caffeinate -dis
```

Or without the Terminal: **System Settings → Lock Screen**, set *Turn display off on power
adapter when inactive* to **Never**, and check **Battery → Options** for *Prevent automatic
sleeping*. Closing the lid still sleeps a Mac whatever else you set, unless a display — or
power plus an external keyboard — is attached.

**Windows** — **Settings → System → Power & battery → Screen and sleep**, and set *When
plugged in, put my device to sleep after* to **Never**. Or, equivalently:

```sh
powercfg /change standby-timeout-ac 0
powercfg /change monitor-timeout-ac 0
```

Closing the lid sleeps it too: **Control Panel → Power Options → Choose what closing the
lid does**, and set the plugged-in column to *Do nothing*.

The same guidance is on the welcome page and in Settings, under the check intervals.

## Notes

- Chrome must be running and the machine awake (see above). MV3 service workers sleep when
  idle — `chrome.alarms` wakes them, and all state lives in `chrome.storage`, so nothing is
  lost.
- Keep the intervals as they are. BookMyShow fronts this with bot detection. Running
  inside your real logged-in session is far less conspicuous than a headless browser, but
  a tight poll loop is still a pattern worth not making.
- Your bot token sits in `chrome.storage.local`, readable by anyone with access to your
  Chrome profile. Fine for personal use; don't reuse a bot that does anything important.
- This only *watches*. It doesn't pick seats, hold them, or book anything. When it pings
  you, open the link and book normally.

## When a showtime gets no +

`window.__bmsSeatWatch()` in the page console prints what the last scan saw. `chips` is
how many showtimes were found on the page, `bound` how many got a button, and `missed`
says why the rest didn't:

| | |
|---|---|
| `noTime` | the element read as a showtime but holds no clock time — `findChips` is picking up something that isn't a chip |
| `noSession` | the time is real, but the listing never returned a showing at it — the response and the page disagree |
| `taken` | every showing at that minute was already claimed, so the page has more chips at one time than the endpoint has showings |
| `ambiguous` | several showings at that minute and nothing on the row separates them, so binding one would be a guess |

Counts only. The reason is a category — never the chip's text, the film, or the cinema.

**No + at all, or a + that says the page needs reloading?** The extension was reloaded or
updated while that tab was open. Chrome doesn't re-inject content scripts into pages that
are already open, so the tab keeps the old script with no way back to the extension. The
buttons dim and a click says so. Reloading the page fixes it, and it will happen again on
every extension update — including the automatic ones.

## Publishing

Two folders exist for the Chrome Web Store and are not loaded at runtime:

- **`icons/`** — the icon artwork as SVG, plus `build.sh`, which re-renders the three PNGs
  the manifest points at. Each size is drawn separately rather than scaled: the 128 shows
  a hall with the screen, rows that widen away from it, and the one adjacent pair that has
  come free; at 16 that becomes four seats and no screen, because anything more is a
  smudge. Edit the SVGs, run `./icons/build.sh`, don't hand-edit the PNGs.
- **`store/`** — `listing.md` holds every field the submission form asks for, including the
  permission justifications and the privacy-practice answers, alongside the screenshots and
  the promo tile.
- **`docs/`** — the privacy policy as a single self-contained file, for hosting. Generated
  by `docs/build.sh` from `privacy.html` and `ui.css`, so there is still only one privacy
  policy and it is the one that ships inside the extension. Re-run the script after editing
  `privacy.html`.

None of the three belongs in the uploaded zip. `store/listing.md` ends with the exact
command.

### Hosting the privacy policy

The store requires the policy at a public URL, and the copy inside the extension does not
count. GitHub Pages is the least-effort route and needs no build:

```sh
git add . && git commit -m "Seat Watch for BookMyShow"
git remote add origin git@github.com:<you>/<repo>.git
git push -u origin main
```

Then on GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / `/docs`**. A
minute later the policy is at:

```
https://<you>.github.io/<repo>/privacy.html
```

That is the URL the submission form wants. Any static host works — the file has no
dependencies — so a Netlify drop or a gist is equally fine if you'd rather not publish the
source.
