# Release watch — post copy

For the 1.3 update. Same rules as [`launch-copy.md`](launch-copy.md): swap anything in
`[square brackets]` for something that actually happened to you. A real Friday beats a
better-written invented one, and inventing one is the fastest way to get taken apart in
the replies.

```
Store   https://chromewebstore.google.com/detail/seat-watch-for-bookmyshow/hkbeaeicmbnldhgfkoonkkebdlphnohn
Repo    https://github.com/yashug/bms-seat-watch-extension
```

**This is not the launch again.** The first launch sold *sold out isn't final*. This one
sells a different miss: **you didn't know it was open.** Don't run them together, don't
say "part two", and don't recap the first — every line spent on it is a line the new
hook doesn't get.

---

## X / Twitter

**The main post.** The story does the work; the product is the last line.

```
I found out [Coolie] was on sale from a friend's message.

Nine hours late. Every decent seat in every decent screen, gone.

Booking doesn't open on release day. It opens whenever the distributor says — often days
early, no fixed hour, no announcement. The page just quietly changes.

So I made the thing watch the film instead of the showtime.
```

**Reply, with the card or the loop attached:**

```
Click the bell on any upcoming film — weeks before there's anything to book.

Pick the cinemas you'd actually go to, and you're told which of them opened. Not "it's
on sale somewhere in the city."

Free, no server, no account: [store link]
```

**The group angle, as its own post a few days later:**

```
Added something for the film group chat.

One person runs it. When booking opens, everyone in the Telegram group gets the alert at
the same second — with a Book now button straight to the page.

Whoever's free books. Nobody finds out nine hours late.
```

---

## Instagram

**Feed post** — `release-square-1080x1080.png`.

```
Booking doesn't open on release day.

It opens whenever the distributor decides — often days early, at no fixed hour, with no
announcement anywhere. The page just changes, and for a big release the good rows are
gone inside the hour.

I got tired of finding out from someone else's "booked!" message, so I built a bell.
Click it on any upcoming film — weeks before there's anything to book. Pick the cinemas
you'd actually go to. When one of them opens, you're told which.

One person can run it for a whole group chat.

Free, open source, link in bio.

#bookmyshow #firstdayfirstshow #tollywood #hyderabad #chromeextension #indiecinema
```

**Reel** — the 18–22s vertical cut from [`release-script.md`](release-script.md).
Cover frame: `release-vertical-1080x1920.png`.

```
Found out from a friend. Nine hours late. 🔔

Booking opens days early, at no fixed hour, with nothing announcing it.
Now I get told the moment it does — and which cinema.

Free on the Chrome Web Store, link in bio.
```

> On-screen text carries the Reel — most of it is watched muted. The three captions in
> the script are the whole story; the caption above is for people who already stopped.

**Story** — one frame, `release-vertical-1080x1920.png`, sticker link to the store.
Second frame: a screen recording of clicking the bell, 4 seconds, no text.

---

## LinkedIn

Lead with the engineering, not the feeling. Different audience, same facts.

```
Small update to a side project, and the interesting part was a dead end.

Seat Watch tells you when BookMyShow seats open up. I wanted it to also tell you when a
film first goes on sale — booking opens days before release, at no fixed hour, with no
announcement.

The obvious endpoint — "what's showing for this film" — returns 400 to every request I
could construct, including the page's own arguments replayed verbatim. Four rounds of
probing, no way through.

What did work was the endpoint pointed the other way: "what's showing at this cinema."
Since you already know which cinemas you care about, you ask about those instead — and
the response carries a group id that matches every language and format of the same film
at once, so a Telugu showing can't slip past a watch set from the Tamil listing.

The dead end made the feature better. Asking per cinema is cheaper than asking per film,
and the matching is exact rather than heuristic.

Free, open source: [repo link]
```

---

## Reddit

`r/bangalore`, `r/hyderabad`, `r/india`, `r/chennaicity` — check each sub's self-promo
rules first, post to **one** and wait a day.

**Title:**
```
Made a free Chrome extension that tells you the moment BookMyShow opens booking for a film
```

**Body:**
```
Booking for a big release doesn't open on release day — it opens whenever the distributor
decides, often days early, at no particular hour, with nothing announcing it. If you're
not refreshing, you find out from a friend, and by then the good rows are gone.

So: click a bell on any film on the upcoming list. Pick the cinemas you'd actually go to.
When one of them starts selling, you get told which one.

It also does the original thing — watching a sold-out showtime for released seats, which
cinemas quietly put back on sale an hour or two before the show.

Runs entirely in your browser. No server, no account, nothing stored anywhere but your
own Chrome. Open source if you want to read it before installing.

If you have a film group chat, one person can run it and everyone gets the alert at once.

[store link] · [repo link]

Happy to answer anything about how it works.
```

> Reddit will ask two things within the hour: *"does this scrape/hammer their site?"* and
> *"why should I trust a random extension?"* Answer both plainly — a watch sleeps until a
> week before release and then checks on one interval you control; nothing leaves your
> browser except the alert you configured. Both answers are true, which is why they work.

---

## WhatsApp / Discord — the group pitch

The most natural channel for this update, because the feature is literally about groups.

```
For the film group — one of us runs this and everyone gets pinged the second booking
opens for whatever we're waiting on. Straight to a Book now button.

Free, runs in Chrome: [store link]
```

---

## What not to say

- **Don't say it books for you.** It doesn't, it never will, and that claim invites both a
  store rejection and a very different kind of attention from BookMyShow.
- **Don't promise you'll get the seats.** You'll be told first. What you do with the head
  start is yours.
- **Don't imply it beats the queue or gets special access.** It watches a public page.
- **Don't stack this on the sold-out hook.** Two revelations in one post halves both.
- **Don't post the group feature as "notify your friends"** without saying everyone gets it
  at once. On a first-day scramble that means your friends racing each other, and someone
  will point that out. Say it first.

---

## Sequence

| Day | | |
|---|---|---|
| 1 | X main post | The story. No product until the last line. |
| 1 | Instagram feed | Square card. |
| 2 | Reel + Story | The vertical cut. |
| 3 | Reddit | One sub. Answer every comment. |
| 4 | LinkedIn | The dead-end engineering story. |
| 6 | X group post | The Telegram group angle, standalone. |
| — | WhatsApp | Whenever it's relevant to a group you're actually in. |
