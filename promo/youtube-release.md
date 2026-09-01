# YouTube upload — the 1.3 release-watch video

Companion to [`youtube.md`](youtube.md), which holds the first video's copy. Same rules:
paste the fenced blocks verbatim, the prose outside them is for you.

The video itself is [`release-script.md`](release-script.md). Its hook is **you found out
too late**, not *sold out isn't final* — do not recap the first video in the title, the
first two lines, or the voiceover. It gets a link at the bottom of the description and
nowhere else, where somebody who liked this one can find it without every new viewer
being told there's homework.

---

## Title

Recommendation first. "Booking opens" and "BookMyShow" are both things people type.

```
BookMyShow opens booking days early with no announcement — here's how to get told the second it does
```

Alternatives:

```
I found out the film was on sale from a friend. Nine hours late.
```

```
Never miss a first-day-first-show booking window again (free Chrome extension)
```

Under ~70 characters survives without clipping on mobile; the recommended title is longer
than that. The short form of it, if you'd rather it never truncates:
`BookMyShow opens booking days early. Get told the second it does.`

---

## Description

Paste as-is. **Only the first two lines show above "…more"**, which is why the hook is
first and the install link is third.

```
Booking for a big release doesn't open on release day. It opens whenever the distributor
decides — often days early, at no particular hour, with nothing announcing it. The page
just quietly changes, and for a first-day-first-show the good rows are gone inside the
hour.

Seat Watch is a free Chrome extension. Click a bell on any upcoming film, weeks before
there's anything to book, and it tells you the moment your cinemas start selling.

⬇️ Install (free, no account):
https://chromewebstore.google.com/detail/seat-watch-for-bookmyshow/hkbeaeicmbnldhgfkoonkkebdlphnohn

━━━━━━━━━━━━━━━━━━━━

WHAT'S NEW

A watch used to need a showtime to exist before you could click it — and that's the
problem it couldn't solve, because by the time a first-day show is listed the seats worth
having are already gone.

So this version watches the film instead of the showing. Every film on BookMyShow's
upcoming list picks up a bell. Click it weeks early. Nothing to book yet is the point.

PICK YOUR CINEMAS

Tick the cinemas you'd actually go to, and the alert names the one that opened — not "it's
on sale somewhere in your city."

This also fixes something invisible. A film is listed several times over, one entry per
language and format, each with its own code. Which of them goes on sale first isn't
knowable in advance. The watch matches on the group id that all of them share, so a Telugu
showing can't slip past a watch you set from the Tamil listing.

PREMIERES AND PREVIEWS

A film's first showings are often the night before release — premieres, benefit shows, 1am
screenings — and for a big release those are frequently the first thing on sale and the
thing people most want. So a watch asks about the night before too, and tells you which of
the two opened.

FOR THE GROUP CHAT

One person runs it. When booking opens, everyone in the Telegram group gets the alert at
the same second, with a Book now button straight to the page. Worth saying plainly: at the
same second means at the same second — on a first-day scramble your friends are racing
each other for the same seats.

IT STILL DOES THE ORIGINAL THING

Watching a sold-out showtime for the seats cinemas quietly put back on sale an hour or two
before the show. Both kinds of watch run side by side.

NO SERVER, AND IT SLEEPS

There's no backend. Your watch list lives in your own browser and nothing is collected,
because there's nowhere to collect it to.

A watch stays dormant until a week before release — configurable, and it wakes earlier if
there's a premiere to catch. A film three months out, checked every ten minutes, would be
about thirteen thousand pointless requests before the first one could matter. Booking
doesn't open months ahead, so it doesn't ask.

It does not book, hold, or pay for anything. It tells you, and you decide.

ONE THING TO SET UP

Nothing runs while your machine is asleep. Stop it sleeping for the evening and keep the
display on — the welcome page walks through it.

━━━━━━━━━━━━━━━━━━━━

LINKS

Install: https://chromewebstore.google.com/detail/seat-watch-for-bookmyshow/hkbeaeicmbnldhgfkoonkkebdlphnohn
Source code: https://github.com/yashug/bms-seat-watch-extension

The other half of this, on the other kind of miss — a show that's sold out right now, and
the held seats that go back on sale before showtime:
https://www.youtube.com/watch?v=PXEYwPYnXAc

Free and open source. Not affiliated with, endorsed by, or connected to BookMyShow.

#bookmyshow #chromeextension #firstdayfirstshow
```

> Three hashtags, at the very end. YouTube surfaces the first three above the title and
> more than three makes all of them count for nothing.

---

## Chapters

Only if the finished cut runs past ~90 seconds. The master in `release-script.md` is
1:00, so most likely skip these — on a one-minute video they clutter the scrubber.

If the cut did grow, read the timestamps off the finished video rather than trusting these,
paste them **above** the LINKS block, start at `0:00`, minimum three, each ≥10 seconds:

```
0:00 Finding out from a friend
0:07 Booking opens days early, at no fixed hour
0:15 The bell — watch the film, not the showtime
0:23 Pick your cinemas
0:33 The whole group gets told
0:45 No server, and it sleeps until release is close
```

---

## Settings when you upload

Same as the first video, with two changes:

- **Visibility: Public** — required if you want it in the store listing's video field.
- **Category:** Science & Technology.
- **Audience:** *Not made for kids.* Getting this wrong disables comments.
- **Thumbnail:** the release card, not the launch one — `promo/cards/` has the 1.3 set.
  Do not reuse `og-1200x630.png` from the first video; two videos with the same thumbnail
  read as a re-upload and people scroll past the second.
- **Captions:** skim the auto-captions once processing finishes. "BookMyShow" and
  "EventGroup" come out mangled, and captions are what muted viewers read.
- **Playlist:** don't make one. The two videos are for different people and a playlist
  invites viewers to go watch the older one first, which is the one thing the script is
  built to avoid.
- **Shorts:** the 18–22s vertical cut goes up separately with `#Shorts` in its title.

## Pinned comment

Pin it the moment it's live — most people never open a description.

```
Free on the Chrome Web Store, no account, runs entirely in your own browser:
https://chromewebstore.google.com/detail/seat-watch-for-bookmyshow/hkbeaeicmbnldhgfkoonkkebdlphnohn

Two things people ask straight away:

It doesn't hammer BookMyShow — a watch sleeps until a week before release, then checks on
one interval you set (10 minutes by default). Nothing leaves your browser except the alert
you configured.

And it doesn't book anything. It tells you first; what you do with the head start is
yours.
```

## Once it's live — do these

- [ ] **Chrome Web Store listing → Store listing tab → video field.** Swap in the new
      video URL. Only one video is allowed, and this one describes the current version.
- [ ] **Pin the comment** above.
- [ ] **Thumbnail** — the 1.3 card, not the launch card.
- [ ] **Captions** — skim them.
- [ ] **README** — add the new link beside the existing demo link.
- [ ] **First video's description** — add a line at the bottom pointing here. That link is
      worth more than the reverse one: it's already accumulating views.

**Where not to paste it:** X and LinkedIn — upload the MP4 natively to both. A YouTube
link costs roughly half your reach on X and won't autoplay in-feed. The YouTube copy is
for the store listing, Reddit, and anywhere someone needs a durable link.
