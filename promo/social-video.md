# The demo video — where each cut goes, and what to say with it

Five files come out of [`video/`](../video). They are not crops of each other; each is
re-framed from the source, so the vertical cut has a camera that knows it is vertical
rather than a 16:9 frame with the sides thrown away.

```sh
cd video && npm run build        # everything, ~25 min
```

| File | Size | Length | Where it goes |
|---|---|---|---|
| `out/seat-watch-demo.mp4` | 1920×1080 | 2:44 | The complete tour. Store listing, the repo, anyone who asks "what does it do". |
| `out/seat-watch-short-x.mp4` | 1920×1080 | 1:00 | **X, uploaded natively.** |
| `out/seat-watch-reel.mp4` | 1080×1920 | 1:00 | **Instagram Reels + Stories**, WhatsApp status. |
| `out/seat-watch-square.mp4` | 1080×1080 | 1:00 | Instagram feed, LinkedIn, Discord. |
| `out/seat-watch-loop.mp4` | 1280×720 | 0:06 | Silent, loops. The attachment on a reply, the top of a Reddit post. |

The one-minute cuts are the same six beats: the claim, the turn, the click, the block it
found, the alert, the card. Everything the settings page explains is the part nobody
watches on a phone.

All of them carry burned-in captions, because **every one of these platforms autoplays
muted.** The narration is the redundant half, not the other way round.

---

## Before anything: this is not YouTube

The full cut is deliberately not going up as a YouTube link to be posted around. That
changes two things and you should know both.

**Upload natively, every time.** A link out of X or Instagram costs roughly half the reach
and will not autoplay. The file goes in the post.

**The Chrome Web Store listing wants a YouTube URL and nothing else.** It has no field for
a file. So the listing keeps whatever is already there — the existing video at
`https://www.youtube.com/watch?v=PXEYwPYnXAc` — unless you decide otherwise. Nothing in
this document touches it.

---

## X

Upload `seat-watch-short-x.mp4` natively. One minute, comfortably inside the 2:20 cap on a
free account (the 2:44 master is not — it needs Premium, and it is the wrong length for a
timeline anyway).

**The post.** No link — links suppress reach. The story does the work and the product is
the last line.

```
Cinemas don't sell out. They stop offering.

Seats get held back — distributor quota, staff, corporate blocks. When nobody claims
them they go back on sale, usually 1–3 hrs before showtime.

Nothing announces it. The page just quietly changes.

So I built the thing that watches for it 🎟️
```

**First reply, with the link:**

```
Free, no account, runs entirely in your own browser:
https://chromewebstore.google.com/detail/seat-watch-for-bookmyshow/hkbeaeicmbnldhgfkoonkkebdlphnohn

Click the + on any showtime — including the greyed-out ones, those are the point.
Tell it how many seats you need together and where in the hall.
```

**Second reply, with `seat-watch-loop.mp4` attached:** the six-second version, for anyone
who did not watch a minute of anything.

```
The whole thing in six seconds.
```

The full thread — the aisle-versus-seat-numbers bug, the Konva canvas, the encrypted API
response — is already written in [`launch-copy.md`](launch-copy.md#thread). It is the part
that does well with developers; post it as replies under the video, not as a separate post.

**Alt text** (X allows 1,000 characters, and it is read by more people than you would
think):

```
Screen recording of the Seat Watch browser extension. A cinema listing shows four
showtimes, three greyed out as sold out. A small + button appears on each one and is
clicked. The extension's popup shows a miniature seat map with a block of four green
seats highlighted, then a desktop notification reading "Seats open — row F, 6 together,
₹240".
```

---

## Instagram

**Reels** — `seat-watch-reel.mp4`, 1080×1920, one minute. Under the 90-second sweet spot
and well under the 3-minute cap.

Only the first line of the caption shows before "more", so it has to be the hook:

```
Cinemas don't sell out. They stop offering 🎟️

Here's the thing nobody tells you: seats get held back for distributors, staff and
corporate blocks. When nobody claims them they go back on sale — usually 1-3 hours
before showtime. Silently. The page just changes.

If you're not refreshing at that exact minute, you never know it happened.

So I built a free Chrome extension that watches the show for you and pings you the second
4 seats TOGETHER open up — in the part of the hall you'd actually sit in, not row 2.

Link in bio 🎟️

Not affiliated with BookMyShow.
```

There is a second caption written for the film-buff angle — *same film, two screens, not
the same film* — in [`launch-copy.md`](launch-copy.md). Use that one on film accounts and
in film communities; it lands much harder there and it is a different audience.

Hashtags go in the **first comment**, not the caption:

```
#bookmyshow #movienight #fdfs #firstdayfirstshow #imax #moviebuff #cinephile
#chromeextension #buildinpublic #indiedev #hyderabad #tollywood #techindia
```

Swap the city and industry tags for wherever you are posting from. A local tag beats a
generic one every time.

**Cover frame.** Reels let you pick one, and the default will be frame zero — which is a
grey listing and reads as nothing. Pick the frame with the green block in the seat map
(around 0:34), or upload `promo/cards/vertical-1080x1920.png` as the cover.

**Stories** — the same file. Add a link sticker to the store; that is the only place on
Instagram a link actually works.

**Feed** — `seat-watch-square.mp4`. A 9:16 file posted to the feed gets centre-cropped to
4:5 and loses the caption at the top of the frame, which is the whole hook. Post the
square one instead.

---

## The order to do it in

1. **Instagram Reel first**, in the evening. It has the longest tail — it will still be
   collecting views in a week, so it should start earliest.
2. **X the next morning**, video + two replies. Reply to your own post through the day as
   people arrive; do not post a second time.
3. **The loop** goes everywhere else — the Reddit posts, the Discord servers, the group
   chats — as the thing people see before they decide whether to read anything.

Do not run all of them within an hour of each other. The same people follow you in more
than one place and it reads as a campaign rather than as a thing you made.

---

## What can't be done from here

**Nobody can post these for you from this repo.** Uploading to X or Instagram needs your
own logged-in account, and publishing to your audience is your call to make rather than a
build step. Every file above is ready; the posting is manual and deliberately so.

The two-factor version of the same point: the copy carries a real claim about what the
extension does. Watch the cut through once before it goes anywhere with your name on it.

---

## The shot still worth waiting for

Every frame in these files is rendered from the extension's own interface with invented
seat numbers, which the store listing says plainly and which is fine for a demo.

What none of it can be is **a real release caught live** — a sold-out chip in the morning,
the notification at 7pm, four seats together at 7:01. That footage cannot be staged, it
will outperform everything here, and the only way to get it is to leave the extension
running on a genuinely sold-out Friday with a screen recorder armed.

When you get it, it replaces the `alert` scene and everything else still works — see
[`video/README.md`](../video/README.md).
