# Launch copy — every channel

Store and repo links are filled in throughout — copy the fenced blocks as they are.

> **Read this before you post anything.** The posts below are written as *your* story,
> with concrete details filled in — a film, a screen, a night you missed. **Swap them for
> what actually happened to you.** Every specific is marked `[like this]` where it's a
> placeholder. A story with your real Friday in it outperforms a better-written invented
> one every time, and inventing one is the single fastest way to get taken apart in the
> comments by someone who checks.

---

## Who this is actually for

Two audiences, and the copy has to hit both. My first draft only hit the first one.

**The one who missed out.** Opening weekend, everything grey, refreshing until they give
up. The pitch is *sold out isn't final*.

**The one who won't settle for the wrong screen.** This is the bigger, more loyal group and
the one that gets the product immediately. They will watch the film in three weeks rather
than watch it in a bad room. IMAX, the good Dolby screen, the one cinema in town where the
sound is actually set up. For them the extension isn't about *getting a ticket* — it's
about **not settling**. The pitch is *you don't want a seat, you want THAT seat, in THAT
room.*

Lead with audience two on film/fan channels. Lead with audience one everywhere else.

---

## Hook bank

Steal these. Every post below opens with one. The rule for all of them: **first line under
12 words, no context, no setup, and it has to create a question.**

```
1.  I missed [Interstellar] at [IMAX]. Not because it sold out.
2.  "Sold out" on BookMyShow is a lie told on a schedule.
3.  The seats opened at 8:47pm. I was making dinner.
4.  Same film. Two screens. Not the same film.
5.  Cinemas don't sell out. They stop offering.
6.  I refreshed a seat map for three hours and lost anyway.
7.  There were 40 free seats at 6pm. I found out on Monday.
8.  You didn't miss the tickets. You missed the 90 seconds they existed.
9.  The best seats in the city go on sale twice. Nobody tells you about the second time.
10. I built a thing because a mall multiplex ruined [Dune] for me.
```

**Why these work and "I built a Chrome extension that…" doesn't:** every one of them is a
claim the reader either doesn't believe or wants explained. The product is the *answer* to
the hook, which means they've already agreed the problem is real by the time they meet it.

---

## The turn

Every post has the same three-beat shape. Keep it.

1. **Hook** — one line, creates the question.
2. **The turn** — the fact nobody knows: *held inventory gets released 1–3 hours before
   showtime, silently.* This is the whole post. It's genuinely new information to most
   people, and it's shareable **on its own**, which is why the posts travel.
3. **The product, as the obvious consequence** — "so I built the thing that watches for it."
   Never more than three lines. If beats 1 and 2 landed, this one needs no selling.

---

## X / Twitter

### Launch post (attach the 6–8s loop GIF)

```
I missed [Interstellar] at [IMAX].

Not because it sold out. Because it un-sold-out at 7:12pm on a Friday and I wasn't
looking.

Cinemas hold seats back — distributor quota, staff, corporate blocks. When nobody
claims them they go back on sale, usually 1–3 hrs before showtime.

Nothing announces it. The page just quietly changes.

So I built the thing that watches for it 🎟️
```

Link in the **first reply**, not the post — links suppress reach.

```
Free, no account, runs entirely in your browser: https://chromewebstore.google.com/detail/seat-watch-for-bookmyshow/hkbeaeicmbnldhgfkoonkkebdlphnohn

Click the + on any showtime (including the greyed-out ones — those are the point).
Tell it how many seats you need together and where in the hall.
It pings you the moment a matching block opens.
```

### Thread

```
2/ The part nobody believes until it happens to them:

a greyed-out "sold out" showtime is not final inventory. It's a snapshot of what's
currently on offer.

Held blocks get returned when they go unclaimed. On an opening weekend that's
frequently the ONLY inventory left in the good screens.
```

```
3/ Which means the manual version of this is: refresh a seat map every few minutes
for three hours on a Friday evening.

I have done this. I lost anyway. You cannot beat a 90-second window with a human
attention span.
```

```
4/ Here's what I actually cared about though, and it took me a while to admit it:

I don't want a ticket. I want THAT screen.

The same film in a bad room is not the same film. Everyone who's seen [Dune] at
[IMAX] and then again at a mall multiplex knows exactly what I mean.
```

```
5/ So it doesn't alert on "a seat is free."

It alerts on a BLOCK — N seats side by side, no aisle between them, in the part of
the hall you'd actually sit in, not row 2.

4 free in the front corner and 4 dead centre cost the same. One is worth leaving
the house for.
```

```
6/ Adjacency can't come from seat numbers, which I learned the hard way.

Row R on the first screen I tested: free seats numbered 24 down to 01, no gap in
the numbering. Looks like a 24-seat block.

There's an aisle straight through the middle. It's two blocks.
```

```
7/ Which is the fun part. The seat map isn't DOM — it's a canvas drawn with Konva,
and the API response behind it is an encrypted blob. Nothing greppable on the wire.

So it reads Konva's in-memory scene graph and measures the seats where they're
actually drawn.
```

```
8/ No server behind any of this. No account. Your watch list lives in your browser
and checks run in your own Chrome with the session you already have.

There's no backend, so there's nowhere for your data to go.

https://chromewebstore.google.com/detail/seat-watch-for-bookmyshow/hkbeaeicmbnldhgfkoonkkebdlphnohn
```

### Standalone posts — space these out over the following weeks

```
Cinemas don't sell out.

They stop offering, hold a block back for distributors and corporates, and put it
back on sale a couple of hours before the show when nobody claims it.

"Sold out" is a snapshot, not a verdict.
```

```
Unpopular opinion: watching a film in the wrong theatre is worse than not watching it.

You can see it in three weeks. You cannot un-see it in a room where the sound is
set up wrong and the screen is the size of a large TV.
```

```
Four free seats in the front corner and four dead centre are the same row length
and the same price.

Only one of them is worth leaving the house for.

That's the entire design brief for the thing I built.
```

```
you didn't miss the tickets

you missed the 90 seconds they existed
```

---

## LinkedIn

The format LinkedIn rewards: **very short opening line, hard line break, tension, then the
turn.** Long paragraphs get truncated behind "…see more" and die there. Keep the first three
lines under 20 words total — that's all that shows before the fold.

```
I missed [Interstellar] at [IMAX].

Not because it sold out.

Because it un-sold-out at 7:12pm on a Friday, and I wasn't looking.

I found out on Monday, from a friend who'd walked in on a whim and got [row H, dead
centre]. I had checked that morning. Every screen was grey. I'd made peace with it and
booked something else.

Here's what I didn't know then, and what almost nobody knows:

Cinemas hold seats back. Distributor quota, staff allocation, corporate blocks, whoever
might still call. And when nobody calls, those seats go back on sale — usually in the last
one to three hours before showtime, sometimes minutes before it.

Nothing announces it. No email, no banner, no "seats released" flag. The listing just
quietly changes, and if you're not refreshing at that exact minute, you never find out it
happened.

On an opening weekend, that released block is frequently the only inventory left in the
screen you actually wanted.

So I built Seat Watch — a Chrome extension that watches the showtimes you pick and
notifies you the moment a block of seats opens up.

Three decisions that shaped it:

→ It watches for blocks, not seats. Four free seats in the front corner and four dead
centre are the same price, and only one is worth leaving the house for. So the filters are
about how many seats sit side by side and where in the hall they are — never mere
availability.

→ Adjacency is measured, not inferred. Seat numbers lie. The first screen I tested had a
row with free seats numbered 24 down to 01, no gap in the numbering — and an aisle
straight through the middle. Number-based logic would have promised a 24-seat block that
doesn't exist. So adjacency comes from where the seats are actually drawn.

→ There is no backend. Reading a seat map means being signed in, and I did not want to be
the person holding anyone's session. Everything runs in your own browser, with the login
you already have. No account, no server, nothing collected — which also means there's
nothing of yours for me to lose.

It's free. https://chromewebstore.google.com/detail/seat-watch-for-bookmyshow/hkbeaeicmbnldhgfkoonkkebdlphnohn

The honest limitation, because I'd rather say it than have you find it: Chrome has to be
running and your machine can't be asleep. Which is exactly when a laptop nods off. The
welcome screen walks through stopping that.

Not affiliated with, endorsed by, or connected to BookMyShow.
```

### Shorter LinkedIn variant, if the above feels long for your feed

```
Same film. Two screens. Not the same film.

Anyone who's watched [Dune] at [IMAX] and then again at a mall multiplex knows this
isn't snobbery. It's a different experience with the same name on the ticket.

Which is why "sold out" at the good screen is worth waiting on rather than settling
around — and here's the part most people don't know:

Cinemas hold seats back, and release them 1–3 hours before showtime when nobody claims
them. Silently. The page just changes.

I got tired of refreshing for it, so I built a Chrome extension that watches instead, and
pings me when a block of seats together opens up in the part of the hall I'd actually sit
in.

Free, runs entirely in your own browser, no account: https://chromewebstore.google.com/detail/seat-watch-for-bookmyshow/hkbeaeicmbnldhgfkoonkkebdlphnohn
```

---

## Hacker News — Show HN

HN is the one channel where the story hook is wrong. Lead with the technical constraint.
Post **Tue–Thu, 8–10am IST**. Never ask for upvotes.

**Title** (80 chars, no "I built", no exclamation):

```
Show HN: Chrome extension that reads a canvas seat map to catch late ticket releases
```

**First comment — post immediately after submitting:**

```
Indian cinemas release blocked inventory (distributor/staff/corporate holds) back onto
sale in the last 1–3 hours before a show, and nothing announces it — the listing just
changes. This watches the showtimes you pick and notifies you when a block of adjacent
seats appears.

The interesting constraint: BookMyShow's seat map isn't DOM. It's an HTML5 canvas drawn
with Konva.js, and the API response behind it is an AES-encrypted blob, so there's nothing
greppable on the wire and nothing to select in the page. The only way to know which seats
are free is to read Konva's in-memory scene graph and measure the rendered geometry.

Which turns out to be the right layer anyway, because seat numbers can't be trusted for
adjacency. On the first screen I tested, a row had free seats numbered 24 down to 01 with
no gap in the numbering — and an aisle straight through the middle. Two blocks, not one.
The adjacency threshold is derived per render from median seat width × 1.5 rather than
hardcoded, because the layout scales with the window; width is the right anchor because
unlike any gap statistic, aisles can't skew it.

Two other things I didn't expect:

- The showtimes API returns an AvailStatus per show and it lags — a show reporting "sold
  out" can have free seats on its layout page. It appears to be computed on an interval.
  It lags hardest during exactly the late release the whole thing exists to catch, so the
  obvious optimisation (poll the cheap JSON, only open the seat map when status flips)
  would cut traffic a lot and go silent at the one moment it matters. There are tests
  asserting the background worker never even references that field.

- The page only builds the canvas when it's visible. In a hidden tab, Konva loads but
  never creates a stage, and Chrome freezes the renderer after ~40s. So checks run in a
  small unfocused popup window that has to stay on screen — a limitation I can't engineer
  away, stated up front rather than buried.

No backend: watch list and settings are local, checks run in your own browser with your
existing session, nothing is proxied or replayed. Checks are jittered and floored at once
a minute.

Source: https://github.com/yashug/bms-seat-watch-extension
Store: https://chromewebstore.google.com/detail/seat-watch-for-bookmyshow/hkbeaeicmbnldhgfkoonkkebdlphnohn

Not affiliated with BookMyShow.
```

**Have answers ready for:**

- *Isn't this against their ToS / won't you get blocked?* Answer straight: it loads pages
  in your own browser as you, at human intervals with jitter and a hard one-minute floor;
  it doesn't book, hold, proxy, or touch credentials. Don't get defensive, don't claim it's
  definitely fine.
- *Why not just use the API?* Encrypted payload, lagging status field — covered above.
- *Why no server?* A server would need your session to read a seat map. That's the thing
  nobody should hand over.

---

## Reddit

Reddit will outperform everything else here and will also ban you fastest for getting it
wrong. Non-negotiables:

1. **Read each sub's self-promo rule first.** Several need account age or comment karma.
2. **Never post the same text twice.** The spam filter catches it and both mod teams see it.
3. **The post is the PSA, not the product.** Every post below would be worth upvoting with
   the last paragraph deleted. That's the test — if removing your link makes the post
   pointless, it's an ad and it'll be treated as one.
4. **One sub per day.** Not five in an hour.
5. **Answer every comment for six hours.** That's what decides whether it travels.

### r/hyderabad / r/bangalore / r/mumbai / r/Chennai / r/pune / r/india

Your own city first — you can answer local questions credibly there.

```
Title: PSA: "sold out" shows on BMS usually get seats back 1-3 hours before showtime.
I found out the expensive way.

Missed [Interstellar] at [Prasads IMAX] last [month]. Checked in the morning, every show
grey, gave up, booked something else.

Friend of mine walked in at 8pm on a whim and got [row H, dead centre]. Same show I'd
written off.

Turns out cinemas hold seats back — distributor quota, staff, corporate blocks — and when
nobody claims them, they go back on sale. Usually in the last 1-3 hours before the show,
sometimes minutes before. Nothing announces it. The page just quietly changes, and if
you're not refreshing at that exact minute you never know it happened.

So if you're eyeing a show this weekend and every good screen is grey right now: don't
book the bad screen yet. Check that specific show again late on the day.

I got tired of refreshing manually for three hours and made a free Chrome extension that
does it instead — click a + on any showtime (including the sold-out ones, those are the
whole point), tell it how many seats you need together and roughly where in the hall, and
it pings you when a matching block opens up. Click the notification and you're on the seat
map.

https://chromewebstore.google.com/detail/seat-watch-for-bookmyshow/hkbeaeicmbnldhgfkoonkkebdlphnohn — free, no account, runs in your own browser, code's open at https://github.com/yashug/bms-seat-watch-extension
if you'd rather look first. 60-second demo of it working: https://youtu.be/PXEYwPYnXAc

Fair warning on limitations: Chrome has to be running and your machine can't be asleep,
which is annoying because releases land late in the evening. And it doesn't book anything
for you — it just tells you fast.

Not affiliated with BookMyShow in any way. But seriously, the PSA stands on its own — the
seats come back whether or not you use anything.
```

### r/tollywood / r/bollywood / r/MarvelStudios / r/boxoffice — release weekends only

Short. These subs smell an ad instantly.

```
Title: Reminder before [Friday]: the good screens usually get seats back a couple of
hours before showtime

Cinemas hold seats for distributors, staff and corporate blocks. Unclaimed ones go back
on sale late — often the last 1-3 hours, sometimes minutes before the show. Nothing
announces it, the listing just changes.

So if [IMAX/Dolby] is fully grey for opening weekend right now: don't settle for the bad
screen yet. Check that exact show late on the day.

Watching it in the wrong room genuinely isn't the same film, and it's worth one more check
before you give up on the right one.

(I built a free extension that watches for it so I don't have to sit refreshing —
https://chromewebstore.google.com/detail/seat-watch-for-bookmyshow/hkbeaeicmbnldhgfkoonkkebdlphnohn — but ignore that, the PSA is the point.)
```

### r/developersIndia

Build story. This sub rewards technical honesty and punishes marketing voice — no hook
line, just the problem.

```
Title: BookMyShow's seat map is a canvas with an encrypted API behind it. Here's how I
ended up reading it.

Wanted to catch the late seat releases cinemas do 1-3 hours before showtime, which meant
knowing which seats are free on a given show without sitting there refreshing for three
hours.

Turns out you can't just read that. The seat map isn't DOM — it's an HTML5 canvas drawn
with Konva.js, and the API response behind it is an AES-encrypted blob. Nothing in the
HTML, nothing greppable on the wire.

What worked: read Konva's in-memory scene graph from the page and measure the rendered
seat geometry directly. Each seat is a Group with coordinates and a fill, which is enough
to know what's free and where it physically sits.

That turned out to be the correct layer for a reason I didn't anticipate. Seat numbers are
useless for adjacency — first screen I tested had a row with free seats numbered 24 down
to 01, no gap in the numbering, and an aisle straight through the middle. Two blocks, not
one. Number-based logic would have told me there was a 24-seat block that doesn't exist.
So adjacency is a distance test in rendered coordinates, threshold derived per render from
median seat width × 1.5 (the layout scales with window size, and width is the one
statistic an aisle can't skew).

Other thing that bit me: the showtimes API has an AvailStatus per show, and it lags. A
show reporting sold out can have free seats on its layout page — and it lags hardest
during exactly the release event I was trying to catch. So the obvious optimisation (poll
the cheap JSON endpoint, only open the seat map when status changes) would have made the
whole thing go quiet at the only moment it mattered.

Runs client-side in your own browser — no backend, which also means never handling
anyone's session.

Code: https://github.com/yashug/bms-seat-watch-extension · Store: https://chromewebstore.google.com/detail/seat-watch-for-bookmyshow/hkbeaeicmbnldhgfkoonkkebdlphnohn
Demo of it catching a block: https://youtu.be/PXEYwPYnXAc

Happy to answer anything about the canvas reading or the MV3 scheduling side.
```

### r/chrome_extensions / r/SideProject

```
Title: Extension that watches a canvas-rendered seat map for late ticket releases — no
backend, all client-side

Cinemas here hold seats back and release them 1-3 hours before showtime, silently. This
watches the showtimes you pick and notifies you when a block of adjacent seats opens up.

Two things that made it more than "poll an endpoint":

The seat map is a canvas (Konva.js) with an AES-encrypted API response behind it, so
availability exists nowhere in HTML or JSON — it's read from the in-memory scene graph.

And the page only builds that canvas when it's visible. In a hidden tab Konva loads but
never creates a stage, and Chrome freezes the renderer after ~40s. So checks run in a
small unfocused popup window that has to stay on screen. Real limitation, on the store
listing rather than buried.

Scheduling is chrome.alarms with per-show intervals that tighten toward showtime (30 min a
day out, 90 seconds under 3 hours), plus 15% jitter and a hard 1/minute floor.

No server, no account, local storage only.

Demo: https://youtu.be/PXEYwPYnXAc
Store: https://chromewebstore.google.com/detail/seat-watch-for-bookmyshow/hkbeaeicmbnldhgfkoonkkebdlphnohn
Code: https://github.com/yashug/bms-seat-watch-extension
```

---

## Product Hunt

Launch **Tue or Wed, 12:01am PT**. Loop GIF first in the gallery, then the video —
Product Hunt takes the YouTube URL directly: `https://www.youtube.com/watch?v=PXEYwPYnXAc`

**Tagline** (60 chars):
```
Get pinged when seats together open up on a sold-out show
```

**Description:**
```
Cinemas hold seats back — for distributors, staff and corporate blocks — and put them back
on sale when nobody claims them, usually 1–3 hours before showtime. Nothing announces it.

Seat Watch watches the showtimes you pick on BookMyShow and notifies you the moment a
block of adjacent seats opens up — the number of seats you need side by side, in the part
of the hall you'd actually sit in. Click the notification and you're on the seat map.

No server, no account, nothing collected. It runs entirely in your own browser.
```

**Topics:** Chrome Extensions, Productivity, Entertainment, India

**Maker's first comment:**
```
Hey PH 👋

I missed [Interstellar] at [IMAX]. Not because it sold out — because it un-sold-out at
7:12pm on a Friday and I wasn't looking. Found out on Monday from someone who'd walked in
on a whim.

Cinemas release held inventory late, silently, and nobody tells you. That's the whole
premise.

Two things I'm proud of:

It watches for *blocks*, not seats. Four free seats in the front corner and four dead
centre cost the same and only one is worth going for. So the filters are about how many
seats sit together and where in the hall — never availability alone. This matters most to
the people who won't settle for the wrong screen, which is who I built it for and who I
am.

And it has no backend. Reading a seat map means being signed in, and I didn't want to be
the person holding anyone's session. Everything runs in your own Chrome with the login you
already have.

The honest limitation: Chrome needs to be running and your machine can't be asleep, which
is exactly when a laptop nods off. The welcome page walks through stopping that.

Happy to answer anything — especially about reading availability off a canvas, which was
the actual technical problem.
```

---

## Instagram / YouTube Shorts / Reels

Use the **Short cut** from `demo-script.md`. The first line of the caption is the only one
that shows before "more" — it has to be a hook, not a description.

```
I missed [Interstellar] at [IMAX] because it un-sold-out at 7:12pm 😭

Here's the thing nobody tells you: cinemas hold seats back for distributors, staff and
corporate blocks. When nobody claims them, they go back on sale — usually 1-3 hours
before showtime. Silently. The page just changes.

If you're not refreshing at that exact minute, you never know it happened.

So I built a free Chrome extension that watches the show for you and pings you the second
4 seats TOGETHER open up — in the part of the hall you'd actually sit in, not row 2.

Link in bio 🎟️

Not affiliated with BookMyShow.
```

**Alt caption, for the film-buff angle:**

```
Same film. Two screens. Not the same film. 🎬

If you've seen [Dune] at [IMAX] and then again at a mall multiplex you already know this
isn't snobbery.

Which is why I'd rather wait than settle — and it turns out you often don't have to.
Cinemas release held-back seats 1-3 hrs before showtime and nobody announces it.

Free extension in bio that watches for it.
```

Hashtags in the first comment, not the caption:
```
#bookmyshow #movienight #fdfs #firstdayfirstshow #imax #moviebuff #cinephile
#chromeextension #buildinpublic #indiedev #hyderabad #tollywood #techindia
```

Swap the city and industry tags for wherever you're posting from — a local tag beats a
generic one every time.

---

## WhatsApp / Telegram forward

The channel that will actually move installs in India. Must be readable without tapping
"Read more" — that's roughly three lines.

```
Guys, "sold out" on BMS is not final 🎟️

Cinemas hold seats back for distributors/corporates and put them back on sale 1-3 hrs
before the show. Nothing announces it, the page just changes. Missed [Interstellar at
IMAX] this way and only found out after.

Made a free Chrome extension that watches the show and pings you the second 4 seats
together open up 👇

https://chromewebstore.google.com/detail/seat-watch-for-bookmyshow/hkbeaeicmbnldhgfkoonkkebdlphnohn

Runs in your own browser, no login, nothing collected.
```

Send it to groups you're genuinely in. Don't join groups to post it.

---

## Discord

Right channel only — `#showcase`, `#projects`, `#self-promo`. Never general chat.

```
Built this because a mall multiplex ruined [Dune] for me and I refused to let it happen
again 🎟️

Turns out cinemas release held-back seats 1-3 hrs before showtime and nothing announces
it. So this watches the showtimes you pick and pings you when a block of adjacent seats
opens up — N seats side by side, in the part of the hall you'd actually sit in.

It can post the alert to a Discord webhook, so a server can point it at a channel and
everyone gets pinged when the good screen opens up.

Client-side only, no server, no account.
Demo: https://youtu.be/PXEYwPYnXAc
Install: https://chromewebstore.google.com/detail/seat-watch-for-bookmyshow/hkbeaeicmbnldhgfkoonkkebdlphnohn
Code: https://github.com/yashug/bms-seat-watch-extension
```

> The webhook support is the real hook for film servers — one person sets it up, the whole
> channel gets the alert. Lead with that, not the extension.

---

## GitHub / README

Under the title in the root README:

```md
**[Install from the Chrome Web Store →](https://chromewebstore.google.com/detail/seat-watch-for-bookmyshow/hkbeaeicmbnldhgfkoonkkebdlphnohn)** · free, no account, no server
```

Add repo topics: `chrome-extension`, `bookmyshow`, `konva`, `manifest-v3`, `canvas`,
`india`. Put the store URL in the About field. Both are free discovery.

---

## Launch-week sequence

| Day | Do |
|---|---|
| **Day 0 (Tue/Wed)** | Product Hunt 12:01am PT. X launch post + thread that morning IST. LinkedIn same morning. Answer everything all day. |
| **Day 1 (Thu)** | Show HN, 8–10am IST. Technical framing, so it doesn't read as a repost. Sit on the thread. |
| **Day 2 (Fri)** | Your own city sub. Friday is right — it's a "this weekend" post. |
| **Day 3–4 (weekend)** | Reels/Shorts + WhatsApp groups. Peak booking window, best conversion. |
| **Week 2** | r/developersIndia (build story). One more city sub. Film Discords. |
| **Ongoing** | The standalone posts, and the PSA on every big release weekend. |

### Where the video goes, and where it doesn't

The demo is live at **https://youtu.be/PXEYwPYnXAc**. Whether to paste that link or upload
the file is not a detail — it's most of the video's reach.

| Channel | Give it |
|---|---|
| Chrome Web Store listing | The YouTube URL. Plays above the screenshots — the highest-value slot it has. |
| X | **The MP4, uploaded natively.** A YouTube link costs roughly half your reach and won't autoplay in-feed. |
| LinkedIn | **The MP4, uploaded natively.** Same reason. |
| Reddit | Native upload where the sub allows it, otherwise the YouTube link. Already in the post copy above. |
| Product Hunt | The YouTube URL, in the gallery. |
| WhatsApp | The MP4 file itself — nobody taps a link in a group chat. |
| GitHub README | Already linked. To play inline instead, drag the MP4 into the README editor on github.com and GitHub hosts it. |

**Launch week is not the growth loop.** Every opening weekend after it is. The pitch writes
itself on a Friday when every good screen is already grey, and reposting the PSA then costs
nothing. Set a reminder for the next three big releases.

---

## Things not to say

- ❌ "BMS Seat Watch" — or anything that reads like BookMyShow's own product.
- ❌ "Beats bots to tickets", "guarantees you seats", "books automatically." It notifies.
  That's it. Overclaiming here is how you get one-star reviews from people who missed a
  block by 40 seconds.
- ❌ "Undetectable", "bypasses", "scrapes." All three invite the wrong reading and the wrong
  audience.
- ❌ Any claim of partnership or endorsement by a cinema chain. Naming [Prasads IMAX] as the
  screen *you* like in *your* story is normal speech and completely fine — implying they're
  involved is not.
- ❌ Screenshots with your name, email or booking history visible. Check the BookMyShow
  header in every single frame.
- ❌ An invented personal story. Swap the `[bracketed]` details for real ones.
- ✅ Keep "Not affiliated with, endorsed by, or connected to BookMyShow" on anything longer
  than a sentence.
