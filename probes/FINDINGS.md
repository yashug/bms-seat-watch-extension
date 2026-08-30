# Phase 0 findings

Four probe rounds, run in a real browser against region HYD on 2026-08-26.
Raw reports are in the conversation; this is what they settled.

## What works

| Source | Call | Gives |
|---|---|---|
| **byvenue** | `/api/v3/mobile/showtimes/byvenue?dateCode=&venueCode=&regionCode=` | Every film at one cinema on one date. 200 from any page, no auth params, no page context needed. |
| **regions** | `/api/explore/v1/discover/regions` | ~2063 region codes — the city selector's source. |
| **cinemas** | `/<city>/cinemas` | 97 venues in `__NEXT_DATA__`: `VenueCode`, `VenueName`, `SubRegionCode`, and `arrDates`. |
| **film page** | `/movies/<city>/<slug>/<ETcode>` | `releaseDate = 2026-08-28T00:00:00`, `eventReleaseDate`, JSON-LD `datePublished`. |
| **upcoming** | `/explore/upcoming-movies-<city>` | `event_code`, `event_group`, `title`, `language` per card. No date. |

## The match key

`EventGroup` appears on **both** sides of the join:

```
byvenue    Event.EventGroup / ChildEvent.EventGroup   "EG00485290"   (Irumudi)
upcoming   cards[].analytics.event_group              "EG00502597"   (Tom & Cherry)
```

So a release watch stores the EG code and detection is exact string equality.
This matters more than it looks: Irumudi alone has **three** Telugu event codes
(`ET00487933`, `ET00513073`, `ET00513087`), so matching on the ET code a watch
was created with would silently miss the variant that actually goes on sale.
Title matching would have worked but needed normalising; EG needs nothing.

## `arrDates` is a free pre-filter

Every venue record carries the dates it is currently selling:

```json
"arrDates": [{ "ShowDateCode": "20260826", "ShowDateDisplay": "Today, 26 Aug" },
             { "ShowDateCode": "20260827", "ShowDateDisplay": "Tomorrow, 27 Aug" }]
```

If a release date is not in a venue's `arrDates`, booking cannot be open there.
One `/<city>/cinemas` fetch returns this for all 97 venues at once, so a single
request gates every watched theatre before any per-venue call is made.

## What does not work

`/api/movies-data/v5/showtimes-by-event/primary-dynamic` returns **400** to
everything. Across four rounds:

- the page's own `originalArgs` replayed verbatim, real `memberId` and `lsId` included
- called from the matching buytickets page, and cross-film from that page
- `etCodes` as `*`, as the event code, and absent
- `language` empty, `Telugu`, `telugu`; `refEventCode` present and absent
- headers `x-app-code`, `x-region-code`, explicit `accept`

Error codes `1a.1m.1002` (most), `1a.1m.1004`, `1a.1m.1005`, `1a.5m.1001`. The
query is clearly parsed and then refused, so something outside the query string
is required — a signature or a header not visible in the page state. **The
film-first axis is not available.** Note this is the same endpoint `content.js`
uses for the `+` button, which has documented fallbacks; those fallbacks are
presumably what carries production traffic.

## The any-theatre signal

With film-first gone, "tell me if any theatre opens" falls back to the film's own
page. An open film and an unopened one differ only in rendered text:

| marker | selling | not yet |
|---|---|---|
| `Book tickets` | 3 | 0 |
| `Releasing on` | 0 | 2 |
| `Coming Soon` | 2 | 11 |

No structured boolean separates them — `flagDiff` came back empty. So the
detector reads text, which breaks whenever BookMyShow rewords a button.

It must therefore be three-valued, not two. `Book tickets` present ⇒ open;
`Releasing on` present and `Book tickets` absent ⇒ not open; **neither present ⇒
unknown**, which surfaces as a warning rather than silently reading as "not
open". A signal that fails closed would leave a watch quietly never firing,
which is the one failure mode this feature cannot have.

## Consequences for Phase 1

1. **Venue-first is the primary axis**, not the fallback. One `byvenue` call per
   watched theatre per date, matched on `EventGroup`.
2. **Theatre-scoped watches are exact.** No heuristics anywhere in the path.
3. **Any-theatre watches are best-effort**, on a text signal that can go stale,
   and should say so in the UI.
4. **Release date comes from the film page**, fetched once when the watch is
   added — never per check.
5. `arrDates` gates the per-venue calls from a single cinemas fetch.

## Where the code runs — settled

**The service worker can fetch BookMyShow directly. No poller tab, no popup
window, none of the visibility workarounds the seat watcher needs.**

Measured from the extension's own origin:

| call | result |
|---|---|
| `byvenue` | **200, and identical with `credentials: 'omit'`** — 35ms, 4 child events |
| `/hyderabad/cinemas` | 200, 97 venue codes, `arrDates` intact |
| film page | 200, `releaseDate: "2026-08-21T00:00:00"`, `Book tickets` ×3, `EG00485290` |
| `/api/explore/v1/discover/regions` | 200, 715 KB |

That `omit` result matters beyond convenience: release checks never touch the
signed-in session, so they carry no member identifiers and cannot break when a
login lapses. The seat watcher still needs its visible window for the Konva
canvas — this is a second, much cheaper path beside it, not a replacement.

Two verdicts in the round-two report read FAIL against 200 responses; both were
faults in the probe's own matchers, not the endpoints. `regions` was scanned for
a lowercase `"regionCode"` key when round two had found those 2063 codes by
walking parsed JSON across both casings, so Phase 1 parses it by walking rather
than by regex. `jsonLdDate` missed for the same reason and does not matter —
`releaseDate` is the field being used.

## Phase 1, as built on all of this

```
add a watch      film page fetch  → EG code, release date, title
                 (once, on add)

dormant          until releaseDate − 7 days (configurable)

each check       /<city>/cinemas  → arrDates per venue        1 request
                 release date not in a watched venue's arrDates ⇒ skip it
                 byvenue per surviving venue                  ≤ 1 per theatre
                 match ChildEvent.EventGroup === watch.eg     exact

any-theatre      film page → Book tickets / Releasing on / neither
                 three-valued; "neither" warns, never reads as "not open"

fire             desktop + Telegram + webhook, venues named
                 click → buytickets page, existing + button takes over
```
