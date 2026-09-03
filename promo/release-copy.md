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

Every block below fits the free 280-character limit — counted with links at X's flat 23,
and with roughly 20 characters of headroom on the main post for a film name longer than
`[Coolie]`. Check yours before posting if it's a long one; going over silently turns the
post into a thread on some clients and truncates it on others.

**The main post.** Upload the master cut natively — a YouTube link costs you roughly half
your reach and won't autoplay. The story does the work; the product is the last line.

```
Found out [Coolie] was on sale from a friend's message. Nine hours late — every good seat
in every good screen, gone.

Booking doesn't open on release day. It opens whenever the distributor decides,
unannounced.

So I made it watch the film, not the showtime.
```

**Reply, with the loop or the card attached:**

```
Click the bell on any upcoming film — weeks before there's anything to book.

Pick the cinemas you'd actually go to, and you're told which one opened. Not "it's on sale
somewhere in the city."

Free, no server, no account:
https://chromewebstore.google.com/detail/seat-watch-for-bookmyshow/hkbeaeicmbnldhgfkoonkkebdlphnohn
```

**Second reply, the durable link:**

```
Full thing, one minute: [youtube link]
Source: https://github.com/yashug/bms-seat-watch-extension
```

**The premiere angle, as its own post.** This one is a genuine PSA and travels without the
product — post it standalone, a few days later.

```
PSA for first-day-first-show plans: the first showings usually aren't on release day.

Premieres, benefit shows, 1am previews run the night before — and for a big release they
sell out first.

If you're watching release day, you're watching the second wave.
```

**The group angle, its own post a few days after that:**

```
Added something for the film group chat.

One person runs it. When booking opens, everyone in the Telegram group gets the alert at
the same second — with a Book now button straight to the page.

Whoever's free books. Nobody finds out nine hours late.
```

> Say "at the same second" out loud. On a first-day scramble it means your friends racing
> each other, and if you don't name it someone in the replies will.

---

## Instagram

**Reel first.** The 18–22s vertical cut from [`release-script.md`](release-script.md) is
the one that will actually get watched — post it before the feed card, not after. Cover
frame: `release-vertical-1080x1920.png`.

```
Found out from a friend. Nine hours late. 🔔

Booking opens days early, at no fixed hour, with nothing announcing it.
Now I get told the moment it does — and which cinema.

Free on the Chrome Web Store, link in bio.
```

> On-screen text carries the Reel — most of it is watched muted. The three captions in the
> script are the whole story; this caption is for people who already stopped scrolling.

**Feed post** — `release-square-1080x1080.png`, a few days later so it isn't competing
with the Reel.

```
Booking doesn't open on release day.

It opens whenever the distributor decides — often days early, at no fixed hour, with no
announcement anywhere. The page just changes, and for a big release the good rows are
gone inside the hour.

And the first showings usually aren't on release day either. Premieres and 1am previews
run the night before, and they go first.

I got tired of finding out from someone else's "booked!" message, so I built a bell.
Click it on any upcoming film — weeks before there's anything to book. Pick the cinemas
you'd actually go to. When one of them opens, you're told which, and whether it's the
premiere or release day.

One person can run it for a whole group chat.

Free, open source, link in bio.

#bookmyshow #firstdayfirstshow #tollywood #hyderabad #chromeextension #indiecinema
```

**Story** — three frames, sequential, over two days:

1. `release-vertical-1080x1920.png` with a sticker link to the store.
2. A 4-second screen recording of clicking the bell on the upcoming list. No text.
3. A real alert on your phone, as it arrives. This is the one worth waiting for — reshare
   it as a Story the day a booking window actually opens, with the film named. That frame
   is more persuasive than anything rendered, because it's dated and it's real.

---

## LinkedIn

Lead with the engineering, not the feeling. Different audience, same facts. Upload the
master cut natively here too — LinkedIn treats an off-platform video link the way X does.

```
Small update to a side project, and the interesting part was a dead end.

Seat Watch tells you when BookMyShow seats open up. I wanted it to also tell you when a
film first goes on sale — booking opens days before release, at no fixed hour, with no
announcement.

The obvious endpoint — "what's showing for this film" — returns 400 to every request I
could construct, including the page's own arguments replayed verbatim. Four rounds of
probing, no way through.

What did work was the endpoint pointed the other way: "what's showing at this cinema."
Since you already know which cinemas you care about, you ask about those instead. Two
things fell out of that which I hadn't planned:

The response carries a group id shared by every language and format of the same film. One
film has several event codes — one release I tested had three, all the same language — and
which of them goes on sale first isn't knowable in advance. Matching on the group means a
watch set from one listing can't miss another. Exact string equality, no title heuristics.

And asking per cinema is cheaper than asking per film, because you only ever care about
three or four cinemas, not ninety-seven.

The dead end made the feature better. Worth remembering the next time an API refuses you:
the question you were trying to ask may not be the best-shaped one.

Free, open source: https://github.com/yashug/bms-seat-watch-extension
```

> The "one film, three codes" detail is the line technical readers reply to. Keep it
> concrete and keep the number in.

---

## Reddit

`r/bangalore`, `r/hyderabad`, `r/india`, `r/chennaicity` — check each sub's self-promo
rules first, post to **one** and wait a day.

### If you get "Sorry, this post was removed by Reddit's filters."

That exact wording is Reddit's own site-wide spam filter, **not the subreddit's mods** —
a mod or AutoMod removal names the sub, and usually leaves a comment saying which rule.
The post isn't deleted. It's sitting invisible in that sub's filter queue, waiting for a
human. Three things put it there, in order of likelihood:

- **Links in the body.** An account with little history dropping a Chrome Web Store URL
  and a GitHub URL into one post is the precise shape the filter exists to catch.
- **No footprint in that sub.** No comments there, no karma there, and a post history
  that is mostly your own project.
- **The same URL sent to several subs close together.**

What to do, in order:

1. **Modmail the sub.** One short human paragraph — what the post is, that it's free and
   open source, that you'll take it down if it doesn't fit the sub. Ask them to look in
   the filter queue. Mods approve these routinely, and this is the only step that
   recovers *this* post.
2. **Don't repost while you wait.** A duplicate of a filtered post is what turns one
   filter hit into a site-wide flag on the account.
3. **If nothing comes back in a day, post the link-free version below** — links out of
   the body entirely, into your own comment afterwards.

Worth doing before any of it: spend a few days commenting normally in the sub you want.
The filter is scoring the account, not the sentence.

**Title:**
```
Made a free Chrome extension that tells you the moment BookMyShow opens booking for a film
```

**Body** — no links, deliberately:
```
Booking for a big release doesn't open on release day — it opens whenever the distributor
decides, often days early, at no particular hour, with nothing announcing it. If you're
not refreshing, you find out from a friend, and by then the good rows are gone.

So: click a bell on any film on the upcoming list. Pick the cinemas you'd actually go to.
When one of them starts selling, you get told which one.

It also does the original thing — watching a sold-out showtime for released seats, which
cinemas quietly put back on sale an hour or two before the show.

Runs entirely in your browser. No server, no account, nothing stored anywhere but your
own Chrome. It's free and the code is public, so you can read it before installing.

If you have a film group chat, one person can run it and everyone gets the alert at once.

It's on the Chrome Web Store as "Seat Watch for BookMyShow" — I'll drop the store and
repo links in a comment so this post isn't just a link.

Happy to answer anything about how it works.
```

Then, once the post is actually live, add the links as your own top-level comment:

```
Store: [store link]
Code: [repo link]
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

Now that there's a video, it goes up first — everything else either carries the file or
links to it, and the store listing wants the URL before the posts start sending people
there.

| Day | | |
|---|---|---|
| 0 | YouTube + store listing | Upload the master, swap it into the Chrome Web Store video field, pin the comment. See [`youtube-release.md`](youtube-release.md). |
| 1 | X main post | The story, master cut uploaded natively. Two replies underneath. |
| 1 | Instagram Reel + Story | The vertical cut. Reel before the feed card, not after. |
| 3 | Reddit | One sub. Answer every comment. |
| 4 | LinkedIn | The dead-end engineering story, video native. |
| 5 | Instagram feed | Square card, once the Reel has run. |
| 7 | X premiere PSA | Standalone. Travels without the product. |
| 9 | X group post | The Telegram group angle, standalone. |
| — | WhatsApp | Whenever it's relevant to a group you're actually in. |
| — | Instagram Story | The day a real booking window opens — reshare the actual alert. |

The `[youtube link]` in the X reply is the only placeholder left besides the `[bracketed]`
story details.
