# The demo video

A 2m39s narrated walkthrough of every feature, rendered from the extension's
own code with [Remotion](https://remotion.dev). Nothing in it is drawn to look
like the interface — the interface is screenshotted, by the interface.

```sh
npm install
npm run build          # states -> voice -> music -> all six cuts  (~25 min)
open out/seat-watch-demo.mp4
```

Six cuts come out, and the four social ones are not crops of each other — each re-frames
from the source, so the vertical one has a camera that knows it is vertical rather than a
16:9 frame with the sides thrown away.

| Composition | Size | Length | For |
|---|---|---|---|
| `Demo` | 1920×1080 | 2:44 | the complete tour |
| `Short` | 1920×1080 | 1:00 | X, native upload |
| `Reel` | 1080×1920 | 1:00 | Instagram Reels and Stories |
| `Square` | 1080×1080 | 1:00 | Instagram feed, LinkedIn |
| `Loop` | 1280×720 | 0:06 | silent, loops, for a timeline |
| `AddFilm` | 1280×720 | 0:14 | silent, loops, how a film gets watched — both routes |

Where each one goes and what to post with it: [`promo/social-video.md`](../promo/social-video.md).

Or a step at a time:

| | |
|---|---|
| `npm run states` | shoot the UI states from popup.html / options.html |
| `npm run voice`  | render and measure the narration |
| `npm run music`  | synthesise the score to fit the cut |
| `npm run render` | cut the master |
| `npm run render:all` | cut all six |
| `npm run render:addfilm` | just the how-to loop |
| `npm run render:addfilm:gif` | the same as a GIF, for a README or a store listing |
| `npm run studio` | scrub them in Remotion Studio, which is where you should edit |

### The how-to loop

`AddFilm` answers one support question: *how do I put a film on the release watch?*
There are two answers, because there are two places you meet a film you can't book yet —
browsing the upcoming list, and standing on the film's own page having followed a link —
and the bell is **not in the same corner of both**. On a card it sits top-right. On a film
page it floats bottom-**left**, clear of BookMyShow's own *Book tickets* button. Somebody
shown only the card goes looking in the wrong corner, which is why this shows both routes
rather than one and a sentence about the other.

It is silent and labelled rather than narrated: it plays muted in a store listing or a
README, so each route carries a numbered caption, and the numbering is there for a viewer
who arrives mid-loop and needs to know they are in the second of two rather than watching
one long take. The two routes are a hard cut, not a dissolve — they are alternatives, and
cross-fading them would read as "and then".

The surfaces are drawn, not screenshotted, the same decision as the chip row and for the
same reason: recreating BookMyShow's pages pixel for pixel and cutting them into a video
would be a claim about their site that a mock-up cannot make. The *button* is exact —
every value in `components/Bms.tsx` is lifted from `content.css`, because the button is
the thing being demonstrated.

## How it works

The awkward part of a product demo is that the product is a Chrome extension:
you cannot script a real popup frame by frame, and a screen recording cannot be
re-cut when a line of narration changes. So the video is assembled from three
things that are each cheap to rebuild.

**1. The interface, shot from its own code.** `shots/make-states.py` wraps
`popup.html` and `options.html` in a stub that supplies the `chrome.*` APIs and
an anchored clock, then `shots/build-states.sh` screenshots each one headlessly
at 2x. This is the store-screenshot pipeline (`store/shots/`) pointed at a
different problem — a video needs *the same screen either side of a click*, so
the popup is rendered once with two seats-together and once with four, and a
120ms cross-fade between them at the moment of the click reads as the interface
responding.

The same pass measures the rect of every element the video points at and writes
it to `public/states/states.json`. Scenes ask for `rect('opt-seats-tight',
'#minAdj')`, never for a pixel offset — so when the settings page grows a field,
the close-up moves with it instead of landing on the wrong control.

**2. The narration, measured.** `voice/build-voice.sh` renders each line with
macOS `say` and reads its real duration back with `afinfo`. Scene lengths come
from those numbers, so rewriting a line and rebuilding moves everything after it
and no scene is ever cut off mid-sentence.

**3. A score that knows where the cut is.** `music/build-music.py` synthesises
the bed from scratch — a slow pad, a soft pluck, a low root and three bell
accents, in A minor at 80bpm. It reads the same scene timings the video does, so
the pluck enters when the product first appears, the bass arrives with the
filters, both step back for the closing claim, and the final bell lands on the
end card so the ending is written rather than faded into.

Nothing is licensed, which matters for something going on a store listing and
YouTube: there is no library whose terms can change under you eighteen months
from now, because every sample comes out of that file. `src/music.ts` then ducks
it under each spoken line and lets it back up in the `hold` seconds between
them, smoothed over half a second so a sustained pad never pumps.

**4. A camera over a flat plate.** Everything is drawn once at its own natural
size — a 384px popup is 384px — and `components/Camera.tsx` decides what is on
screen. Zoom is a property of the shot, not of the artwork, so one still serves
both a wide establishing frame and a close-up on a single input.

## Changing it

**The script** is `script.json`: one entry per scene with its narration, its
burned-in captions and a `hold` after the voice stops. `cuts` at the bottom names
which scenes each cut uses — the score builder reads the same list, so a scene added
to a cut gets music written around it without a second edit. Rewrite a line, run
`npm run voice`, re-render. Scene ids map to components in `src/Demo.tsx`.

**The voice** is **Tara**, the Indian English female voice macOS ships, at
166 wpm. Change it in `script.json` or per run:

```sh
VOICE="Aman" npm run voice          # `say -v '?'` lists what is installed
```

Short names resolve to whatever build is installed — ask for `Tara` and you get
`Tara (Premium)` if it is there, `Tara (English (India))` otherwise. Ask for
something that is not installed and the build stops. That check is worth having:
`say -v NoSuchVoice` exits 0 and silently narrates in the system default, so a
typo would otherwise produce a whole video in the wrong voice with nothing
reporting a problem.

Two ways up in quality:

- **Install a better build.** System Settings → Accessibility → Spoken Content →
  System Voice → Manage Voices; look for an en-IN Premium or Enhanced voice.
  It is a one-time download and the pipeline picks it up with no other change.
- **Bring your own.** The Siri-quality voices are not reachable from `say` —
  macOS ships `RiyaSiri`/`AkashSiri` as bundles but will not hand them out, and
  asking for them just silently returns the default. So for a real step up,
  record the lines or generate them elsewhere, drop 44.1k mono WAVs into
  `public/vo/<scene-id>.wav`, and run `KEEP=1 npm run voice` to measure them
  without overwriting.

**The music** is `music/build-music.py`. The chords, the pattern the pluck walks
and the arrangement — when each stem enters and leaves, in scene ids rather than
timecodes — are all constants at the top of that file. To drop in a licensed
track instead, put it at `public/music/bed.wav` and skip `npm run music`;
`src/music.ts` will duck whatever is there.

**The fixture data** — the film, the cinema, the hall, the blocks it finds — is
at the top of `shots/make-states.py`. The seat numbers, prices and counts are
invented; the interface drawing them is the real one.

## The one scene worth replacing by hand

Scene 3 (`add`) shows the **+** button on a showtime. That chip row is *drawn*
by `components/Props.tsx`, in the extension's own palette, with the button
itself styled from the real values in `content.css` — the same picture the
settings page paints in its "click the +" panel.

It is a diagram, not a screenshot, and deliberately so: cutting a pixel-perfect
recreation of BookMyShow's listing into a promo video would make a claim about
their page that footage of a mock-up cannot honestly make.

If you want the real thing — and it is the single strongest shot available —
record it yourself on a real opening weekend:

- Clean Chrome profile, no bookmarks bar (`⌘⇧B`), zoom at 100% (`⌘0`), only
  Seat Watch pinned.
- `osascript -e 'tell application "Google Chrome" to set bounds of front window to {0, 0, 1440, 860}'`
  — that matches `POPUP_PLATE` in `components/Plate.tsx`, so the footage drops
  straight in.
- Record with the cursor shown, moving slowly, pausing a full second before the
  click. Kap or OBS if you want a click ring.
- Then swap the `<ChipRow>` in `scenes/open.tsx` for `<OffthreadVideo src={staticFile('shots/add.mp4')} />`.

The other footage that can't be staged is a real late release caught live —
sold-out chip in the morning, notification at 7pm, four together at 7:01. Leave
the extension running on a genuinely sold-out Friday show with a recorder armed.

## Notes

- Output is 1920×1080 / 30fps H.264 with AAC audio — what YouTube and the
  Chrome Web Store listing want. The store takes a YouTube URL, not a file.
- `public/states/`, `public/vo/` and `public/music/` are build products. All
  three rebuild from scratch in a couple of minutes.
- `promo/demo-script.md` is the human shooting script for a hand-recorded 60s
  cut. This video is the longer, complete-coverage sibling; the two disagree on
  purpose about length and about how much of the settings page is worth showing.
