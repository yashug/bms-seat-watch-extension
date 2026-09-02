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

## Languages of one film — measured 2026-09-02 (probe-lang.js, HYD)

*I'm Game* opened in three languages and one alert arrived, for the original,
linking to the original's listing. `probe-lang.js` measured the film against a
live BookMyShow and the answer was not what the symptom suggested.

| | Malayalam | Telugu | Hindi |
|---|---|---|---|
| event code | `ET00473215` | `ET00511702` | `ET00511704` |
| **EventGroup** | `EG00470725` | `EG00470725` | `EG00470725` |
| **EventUrl** (byvenue) | `im-game` | `im-game-telugu` | — |
| film page `releaseDate` | 2026-09-03 | 2026-09-03 | 2026-09-03 |
| `Book tickets` / `Releasing on` counts | 3 / 2 | 3 / 2 | 3 / 2 |

**The group is shared, and matching was never broken.** byvenue returned the
Telugu row under `EG00470725`, `matchesFilm` matched it, and it was folded into
the same alert as the Malayalam one. What was broken was everything after the
match:

- one notification id per watch, so the second language's alert **replaced** the
  first rather than joining it;
- one merged body, naming cinemas and days but never a language;
- a link built from `watch.eventCode` and `watch.slug`, so every alert pointed at
  the listing the watch was created from.

**The slug is per language, and it is not a suffix-free variant of the original**
— `im-game` vs `im-game-telugu`. So a link must follow the *listing's* `EventUrl`,
not the watch's slug: `/movies/hyderabad/im-game/buytickets/ET00511702/…` is the
wrong address for the Telugu code. The `-<language>` suffix is a real convention
and is what `filmStem()` keys on, with a closed list of language words so that
`im-game-2` reads as a sequel rather than a variant.

**Both sibling codes appear in the parent page's HTML**, and every language's
page carries all three — so a watch can learn its siblings from a page it was
already fetching. The film page ships **no `__NEXT_DATA__`** (`hasNextData:
false`, 248 KB), so that has to be read out of the markup, not the state.

**The buytickets page also carries every language's code**, which is where the
switcher gets them.

**The film page cannot tell one language from another — but the probe did not
prove that, and the first reading of it was wrong.** All three pages carry
identical `Book tickets` (3) and `Releasing on` (2) counts, and that was read as
"the signal is per film, not per listing". It shows no such thing: all three
listings were *already on sale* when the probe ran, so identical counts are what
a per-listing signal would produce too. The measurement cannot separate the two
cases, and `Book tickets: 3` sitting beside `Releasing on: 2` on the same page
says the counts are picking up page furniture either way.

What is established is weaker and still decisive: nothing on the film page has
been shown to distinguish the languages, so the any-theatre path must not claim
one. `probe-lang-2.js` asks the sharper question — whether the *buytickets* page,
which is per code and per date, separates a selling listing from a dead one
(structurally, by venue codes and session ids, not by wording), using a date the
film is certainly not showing as the unopened sample.

### Round two — the per-language signal, measured 2026-09-02 (probe-lang-2.js)

**The film page carries a language switcher as data.** Not links to be scraped —
a structure naming each language and the code that books it:

```json
{"language":"Hindi","formats":[{"dimension":"2D","eventCode":"ET00511704",
  "analytics":{…},"refEventCode":"ET00511704","language":"Hindi"}]}
```

One language can hold several formats, each its own code. This is the source
`parseLanguages()` reads, and it is why an any-theatre watch can know its own
languages. It has to be read out of the **text**: these pages ship no
`__NEXT_DATA__` at all (248 KB, none).

**Sibling links on the page are national, not city-scoped** —
`/movies/im-game-telugu/ET00511702`, in the "Upcoming & NowShowing …" rails at
the foot. A reader requiring `/movies/<city>/<slug>/<code>` finds none of them.

**A buytickets page is scoped to its event code.** The same film, the same day:

| listing | cinemas | sessions | bytes |
|---|---|---|---|
| Malayalam `ET00473215` | 17 | 25 | 340 K |
| Telugu `ET00511702` | 54 | 142 | 754 K |
| Hindi `ET00511704` | 2 | 3 | 223 K |

Three codes, three different answers — so the page reflects the **listing**, not
the film. That is the per-language signal the film page could never give, it is
structural rather than wording, and it costs one request per language.
`listingSignal()` reads it, three-valued: cinemas or sessions ⇒ open; none, on a
page that names the code ⇒ closed; anything else ⇒ unknown, which never fires.

**Two things that page is not.** It is **not per date** — `ET00473215` answered
identically for release day and for a date four months out with nothing showing
(340025 vs 340061 bytes, 17 cinemas both times), so the date in the address is
decoration and the signal means "this listing sells tickets", not "on that day".
And the **slug is decoration too**: `im-game/buytickets/ET00511702` returned the
Telugu page (754017 bytes) exactly as `im-game-telugu/buytickets/ET00511702` did.
The code decides. The correct slug is still used in alerts, because a link a
person reads should say what it opens.

The probe's own verdict line reads FAIL, and that is the probe being wrong about
its own question: it looked for a *date* discriminator, and the dead-date sample
proved only that the date is ignored. The discriminator it actually found is the
code.

### What was shipped against all of this

A watch that names theatres alerts **per language** off one byvenue call, naming
the cinema. A watch that names none reads the switcher off the film page, then
asks each listing's own buytickets page — so it alerts per language too, saying
how many cinemas took it, and a language that has not opened stays quiet. One
listing, or none identified, keeps the old single film-page check.

A watch carries `variants[]` — the languages it has learned — from the switcher
data, from addresses under the film's slug stem, from rows already matched in a
byvenue response, and from the city's upcoming list. Matching runs on the group
first, which is sound across languages; the slug stem is the net for a watch
whose group could not be read.
