# Probes

[`FINDINGS.md`](FINDINGS.md) is the one to keep: it records what BookMyShow's endpoints
actually do, and is the reason the code is shaped the way it is. Without it, the first
thing anyone reasonable would try is the film-wide endpoint that returns 400 to
everything — four rounds of probing established that, and re-establishing it costs a
day.

[`health-check.js`](health-check.js) is the only script still worth running. Paste it
into the service worker console when release watches stop firing, before assuming the
bug is in the extension. It checks the four calls the feature depends on and names
whichever one changed.

The `probe-page*.js` and `probe-sw*.js` files below are the archaeology that produced
FINDINGS.md. Their conclusions are all recorded there, and several of them test the dead
film-first endpoint, so they now report failures that are expected rather than
interesting. **They can be deleted** — nothing references them, and they are excluded
from the package. Keep them only if you want the working out.

---

# Phase 0 probes — release watching

Two scripts that answer the questions the release-watch design rests on. Both
have to be pasted into a live console: BookMyShow sits behind Cloudflare, which
returns a 5.4 KB "Attention Required!" page to anything that isn't a real
browser, so neither `curl` nor `verify.mjs` can answer any of this.

Nothing here books, posts, or writes. Both scripts only read, and the only
cookie either looks at is `rgn`, which holds the city.

## Running them

**`probe-page.js`** — open any `https://in.bookmyshow.com/` page → DevTools →
Console → paste the file → Enter. Takes about 15 seconds; it paces itself
between calls on purpose.

**`probe-sw.js`** — `chrome://extensions` → Seat Watch → click **service
worker** → Console → paste the file → Enter.

Each prints a verdict table and copies a full JSON report to the clipboard.

## What each verdict decides

| Probe | Question | If it fails |
|---|---|---|
| `endpoint` *(sw)* | Can the service worker call the API directly? | Every check runs in a poller tab on a BMS page, batched so one tab serves all watched releases |
| `showtimesUnopened` *(page)* | Does an unopened film answer `200` with zero venue cards? | "not open yet" and "endpoint moved" become indistinguishable — detection needs a different signal, probably the movie page's *Book tickets* button |
| `showtimesOpen` *(page)* | Does one call with `etCodes=*` return venue codes **and** every language's event code? | Language variants need scraping from the buytickets dropdown, and the model grows a per-language watch list |
| `cinemas` *(page)* | Does `/<city>/cinemas` carry venue **codes**, not just names? | The theatre picker falls back to substring matching on venue names |
| `cinemas.citiesInState` *(page)* | Is the city dropdown in the page state? | The city selector needs a hardcoded list or another source |
| `upcoming` *(page)* | Do the cards carry an event code and a **release date**? | Without a date there is nothing to schedule against — the 7-day dormancy gate goes, and watches poll from the moment they are added |
| `byVenue` *(page)* | Does `byvenue` answer for a chosen theatre, and do language variants share a clean **title**? | The venue-first axis is unusable before booking opens, and detection stays film-first only |

`INCONCLUSIVE` on `showtimesUnopened` means every film sampled from the upcoming
list already had booking open. Re-run in a day or two, or re-run pointing at a
film you know is not yet on sale.

## Reporting back

Paste the copied JSON. The two reports together settle the poller architecture,
the venue picker, and whether the release-date gate is buildable — which is
everything Phase 1 needs.

## The two axes

There are two endpoints that can answer "has booking opened", and they scale on
opposite variables:

| | call is keyed on | one call returns | cost |
|---|---|---|---|
| **film-first** `showtimes-by-event` | `refEventCode` + date | every venue showing that film | one per **film** |
| **venue-first** `byvenue` | `venueCode` + date | every film at that cinema | one per **theatre** |

For three films across five theatres, film-first is three calls and venue-first
is five. For ten films across two theatres it reverses. Since a release watch
already knows both its film and its chosen theatres, the poller can simply take
whichever axis has fewer units on the date it is checking.

The catch, and what probe 6 exists to measure: film-first is handed one event
code and returns the whole sibling-language family, so it resolves codes by
itself. `byvenue` only reports the per-language `ChildEvent.EventCode`s actually
showing — and before booking opens there is no response to learn the family
from. So a venue-first check has to match on the **title** instead. If probe 6
reports `titlesUsableForMatching: false`, venue-first can only ever be a
confirmation pass after film-first has resolved the codes, not a primary signal.

Both responses are already parsed by shipped code — `parseEventShowtimes`
(content.js:265) and `parseShowtimes` (content.js:133) — so supporting both axes
costs scheduling logic, not parsing.
