# YouTube upload — title, description, settings

**Live:** https://www.youtube.com/watch?v=PXEYwPYnXAc
**Short form, for pasting:** https://youtu.be/PXEYwPYnXAc

The title and description below are what's on it. Kept here so a re-edit doesn't start from
a blank box.

---

## Title

Pick one. First is the recommendation — it carries the hook, and "sold out" plus
"BookMyShow" are both things people actually type into search.

```
Sold out on BookMyShow? Cinemas release held seats 1–3 hrs before showtime — here's how to catch them
```

Alternatives:

```
"Sold out" isn't final — how to get seats on a fully booked BookMyShow show
```

```
I missed a show that wasn't actually sold out. So I built this.
```

Keep it under ~70 characters if you can — beyond that it truncates in search results and on
mobile. The recommended title is long; trim it to `Sold out on BookMyShow? Cinemas release
held seats before showtime` if you'd rather it never clips.

---

## Description

Paste as-is. **Only the first two lines show above "…more"** — that's why the hook is first
and the link is third rather than buried at the bottom.

```
A "sold out" show on BookMyShow often isn't. Cinemas hold seats back — distributor quota,
staff, corporate blocks — and when nobody claims them those seats go back on sale, usually
1–3 hours before showtime. Nothing announces it. The listing just quietly changes.

Seat Watch is a free Chrome extension that watches the showtimes you pick and notifies you
the moment a block of adjacent seats opens up.

⬇️ Install (free, no account):
https://chromewebstore.google.com/detail/seat-watch-for-bookmyshow/hkbeaeicmbnldhgfkoonkkebdlphnohn

━━━━━━━━━━━━━━━━━━━━

WHAT IT DOES

Search BookMyShow the way you normally would, by cinema or by film. Every showtime picks up
a small + in its corner — including the greyed-out sold-out ones, which are the ones worth
using it on. Click it, and that show goes on the watch list with its film, format, cinema
and start time already filled in.

It doesn't alert on "a seat is free." It alerts on a block:

• How many free seats side by side, with no aisle between them
• Where in the hall — anywhere, the middle half, or dead centre
• How many rows to skip at the front
• Only the seats BookMyShow marks as its best, if you like

Four free seats in the front corner and four dead centre are the same row length and the
same price. Only one of them is worth leaving the house for.

HOW OFTEN IT CHECKS

Every show runs on its own clock — 90 seconds when it's under three hours to showtime, half
an hour when it's more than a day away. All five intervals are editable. A show is dropped
six hours after it has played.

WHERE ALERTS GO

A desktop notification you can click straight through to the seat map. Optionally also to
Telegram, or to a webhook — a Discord channel or an ntfy.sh topic both work with a single
address pasted in.

PRIVACY

There is no server behind this. Your watch list and settings live in your own browser, and
checks run in your own Chrome using the session you're already signed in with. Nothing is
proxied, nothing is replayed, no credentials are handled. Because there's no backend, there
is nowhere for your data to be collected or sold.

It does not book, hold, or pay for anything. It tells you, and you decide.

ONE THING TO SET UP

Nothing runs while your machine is asleep — and the release you're waiting for tends to
land late in the evening, exactly when a laptop has nodded off. Stop it sleeping for the
evening and keep the display on. The welcome page walks through it.

━━━━━━━━━━━━━━━━━━━━

LINKS

Install: https://chromewebstore.google.com/detail/seat-watch-for-bookmyshow/hkbeaeicmbnldhgfkoonkkebdlphnohn
Source code: https://github.com/yashug/bms-seat-watch-extension

Free and open source. Not affiliated with, endorsed by, or connected to BookMyShow.

#bookmyshow #chromeextension #movies
```

> Only three hashtags, and they go at the very end. YouTube shows the first three above the
> title, and more than three makes all of them count for nothing.

---

## Chapters

Optional, and only worth adding if the video is over about 90 seconds — on a 60-second demo
they clutter the scrubber for no benefit.

If you do add them: paste them into the description **above** the LINKS block, first one
must be `0:00`, minimum three, each at least 10 seconds long. Timestamps have to match your
actual Loom, so read them off the finished video rather than copying these.

```
0:00 The show that wasn't actually sold out
0:12 Adding a show — one click on BookMyShow
0:25 What counts as a match
0:40 The alert
0:52 No server, no account
```

---

## Settings when you upload

- **Visibility: Public.** The Chrome Web Store will not accept an unlisted or private video
  in the listing's video field.
- **Category:** Science & Technology. (Howto & Style also works; Tech is the better fit.)
- **Audience:** *Not made for kids.* Getting this wrong disables comments, which you want
  for a launch.
- **Language:** English. Add **auto-captions** once processing finishes, then skim them —
  "BookMyShow" and "Konva" come out wrong roughly every time, and captions are what people
  watching muted actually read.
- **Thumbnail:** upload `promo/cards/og-1200x630.png`. YouTube wants 1280×720, so it'll be
  letterboxed slightly — still far better than an auto-grab of a grey listing page. If you
  want it exact, tell me and I'll add a 1280×720 card to the build.
- **Shorts:** a landscape video under 60s is a normal video, not a Short. Only the 9:16 cut
  gets uploaded as a Short, separately, with `#Shorts` in its title.

## Pinned comment

Pin this the moment it's live — it's the only thing that reliably converts a viewer into an
install, since most people never open the description.

```
Free on the Chrome Web Store, no account, runs entirely in your own browser:
https://chromewebstore.google.com/detail/seat-watch-for-bookmyshow/hkbeaeicmbnldhgfkoonkkebdlphnohn

Happy to answer anything here. The one limitation worth knowing up front: Chrome has to be
running and your machine can't be asleep, which is exactly when a laptop nods off — the
welcome page walks through stopping that.
```

## Now that it's live — do these

- [ ] **Chrome Web Store listing → Store listing tab → video field.** Paste
      `https://www.youtube.com/watch?v=PXEYwPYnXAc`. This one is the most valuable place it
      goes: it plays right on the listing, above the screenshots.
- [ ] **Pin the comment** (block above). Most people never open a description.
- [ ] **Thumbnail** — upload `cards/og-1200x630.png` if you haven't. The auto-grab from a
      grey listing page is the worst frame in the video.
- [ ] **Captions** — once processing finishes, skim the auto-captions. "BookMyShow" and
      "Konva" come out mangled almost every time, and captions are what muted viewers read.
- [ ] **Repo README** — done, linked under the store badge.

**Where NOT to paste it:** X and LinkedIn. Upload the MP4 natively to both. A YouTube link
on X costs you roughly half your reach and won't autoplay in-feed, and LinkedIn treats an
off-platform video link the same way. The YouTube copy is for the store listing, Reddit,
Product Hunt and anywhere someone needs a durable link.
