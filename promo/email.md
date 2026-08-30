# Forwardable email

Written to survive being forwarded. Nothing in it assumes who's reading — no "hi team", no
reference to how you know them — so the same text works sent to one person, to a group, or
three forwards down a chain. Pick a subject line, put your name at the bottom, send.

**Subject line — use this one**

```
Sold-out shows often release seats 1–3 hours before showtime
```

It states the mechanism, which is the one fact in this email the reader doesn't already
know; everything else follows from it being true. It claims exactly as much as the evidence
supports, it's short enough to survive mobile truncation, and it carries no "I built a
thing" framing, so it still reads correctly after being forwarded.

Alternates, if the audience is narrower:

- *Free Chrome extension: get pinged when BookMyShow seats open up on a sold-out show* —
  plainer, but leads with the product before the reader cares.
- *Seat Watch — free tool for anyone chasing IMAX/Dolby tickets on opening weekend* — only
  for people who already refuse the wrong screen.

---

Hi,

I built a Chrome extension and put it on the Chrome Web Store, free. If you book on
BookMyShow — especially opening weekends, or if you're picky about which screen you sit in
— it's worth two minutes. Feel free to pass it on to anyone it'd be useful to.

**Watch the 60-second demo:** https://www.youtube.com/watch?v=PXEYwPYnXAc — it's the
fastest way to see whether this is for you.

**Install (free, Chrome Web Store):** https://chromewebstore.google.com/detail/seat-watch-for-bookmyshow/hkbeaeicmbnldhgfkoonkkebdlphnohn

## What it is

**Seat Watch for BookMyShow.** You point it at showtimes you care about, tell it how many
seats you need *together* and where in the hall you'll accept them, and it pings you the
moment a matching block of seats opens up. Free, no account, no sign-up, nothing to pay
for, nothing to configure beyond the bit you actually care about.

## Why it's useful

A big release is never as sold out as it looks. Cinemas hold seats back — for
distributors, staff, corporate blocks, whoever might still call — and when nobody calls,
those seats quietly go back on sale. Usually 1–3 hours before the show, sometimes minutes
before. On an opening weekend that's often the only inventory left.

Nobody announces it. The listing just changes, and by the time you think to look again the
good rows are gone. Refreshing a seat map every few minutes for three hours is the manual
version of this, and it's a bad way to spend an evening.

The second use is simpler: **you want that screen.** The IMAX one, the good Dolby room, the
one where the sound is actually set up. The same film in a worse room isn't the same
evening, so "sold out" there is worth waiting on rather than settling around.

Both cases have the same shape — you don't want *a* seat, you want *those* seats — which is
why the filters are about size and position, not just "is anything free".

## How you use it

1. Install from the store link above and pin it (you'll want to see the badge).
2. Search BookMyShow the way you normally would — by cinema or by film — and open the
   showtimes.
3. Every showtime picks up a small **+** in its corner. Click it. The film, format, cinema
   and start time fill themselves in. Click the **✓** to stop watching.
4. Sold-out showtimes get the **+** too, and those are exactly the ones worth using it on.

You can also paste a seat-layout URL into Settings by hand if you'd rather. The
[demo video](https://www.youtube.com/watch?v=PXEYwPYnXAc) shows the whole thing happening
on a real listing, start to alert, in a minute.

## What counts as a match

Set once as defaults, or per show:

- **Seats together** — how many free seats side by side, with no aisle in between
- **Where in the hall** — anywhere, the middle half, or dead centre
- **Rows to skip at the front** — the nearest fifth, third, or half
- **Bestseller seats only** — the ones BookMyShow marks as its best, at no extra cost

Position is what decides whether an alert is worth acting on. Four free seats in the front
corner and four dead centre are the same row length at the same price, and only one of them
gets you out of the house.

## Where the alerts go

A **desktop notification**, always — clickable, with *Open seats* and *Snooze* buttons, and
clicking it drops you straight on the seat map ready to book.

Optionally also to **Telegram** (make a bot with @BotFather, about two minutes) or to a
**webhook** — a Discord channel webhook or an ntfy.sh topic both work with one address
pasted in, so you can get these on your phone.

You get told once per block, not once per check: a block that's still free next check stays
silent, a *different* block opening later alerts again.

## How often it checks

Every show runs on its own clock, so tonight's screening is watched hard and next week's is
barely touched:

| Time until showtime | Checks every |
|---|---|
| more than 24h | 30 min |
| 6–24h | 15 min |
| 3–6h | 5 min |
| **under 3h** | **90 sec** |

A show is retired 15 minutes after it starts and drops off the list six hours later. All
the intervals are editable in Settings. Nothing ever checks more than once a minute.

## Two things you actually have to know

**1. Your machine has to be awake, with Chrome running.** Nothing runs while a laptop is
asleep — and the release you're waiting for tends to land late in the evening, exactly when
a laptop has nodded off. This is the single most common reason it appears to do nothing.
Plug in and stop it sleeping: on a Mac, `caffeinate -dis` in Terminal (or Lock Screen
settings → never turn the display off); on Windows, Settings → System → Power & battery →
Screen and sleep → Never. The extension's welcome page walks through both.

**2. A small watcher window stays on screen.** Checks run in a little popup window in the
bottom-right corner. You can shove it behind everything else and ignore it, but don't
minimise it and don't let it be completely covered. That isn't a preference — BookMyShow
only draws the seat canvas when the page is visible, so a hidden window reads nothing. It
opens unfocused, so it never steals your typing. (If you already have that seat map open
yourself, it just reads your own tab and no extra window appears.)

## Privacy — the part worth reading before installing anything

- **There is no backend.** Nobody operates a service behind this, so there's nowhere for
  your data to be collected, sold, or breached. Your watch list and settings live in
  `chrome.storage.local` on your own machine, and uninstalling deletes them.
- **Checks run in your own Chrome, in the session you're already signed into.** Nothing is
  proxied, nothing is replayed, no credentials are read, stored, or sent anywhere.
- **Your BookMyShow account details are never read.** Your name, email, mobile and session
  token sit in the same page data as the showtimes, and the code doesn't go into those
  branches at all — there's a test that trips if anything touches them.
- **It does not ask for the `tabs` permission** — the one Chrome shows at install as "Read
  your browsing history". It never reads any tab's URL, title, or favicon.
- The permissions it does ask for: `alarms` (scheduling that survives Chrome suspending the
  extension), `storage` (your list and settings, locally), `scripting` (seat availability is
  drawn to a canvas and exists in no HTML or JSON — the only way to read it is to measure
  the canvas), `notifications` (the alert itself), and access to `in.bookmyshow.com`. If —
  and only if — you set up a webhook, Chrome asks you separately for that one address.
- No remote code. Everything it runs ships inside the package.

The full policy is linked from the extension's Settings page and from the first-run page.

## Fair warnings

- **It only watches. It doesn't book, hold, pick, or pay for anything.** When it pings you,
  you open the link and book normally, like anyone else. No queue-jumping, no bots buying
  tickets.
- Works on **in.bookmyshow.com** only — India — on desktop **Chrome**.
- If you're on a work laptop with a managed browser, extension installs may be blocked by
  policy. Probably one for a personal machine anyway, given it needs to stay awake all
  evening.
- **Not affiliated with, endorsed by, or connected to BookMyShow.**

Questions, bugs, or ideas — just reply to this and I'll pick it up.

Cheers,
[your name]
