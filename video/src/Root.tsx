import React from 'react';
import { Composition } from 'remotion';
import { Cut } from './Cut';
import { Demo } from './Demo';
import { AddFilm, ADD_FILM_SECONDS } from './AddFilm';
import { Loop, LOOP_SECONDS } from './Loop';
import { FPS, H, W } from './theme';
import { CUTS, TOTAL_FRAMES, cutOf } from './timeline';

/**
 * Five cuts of one video.
 *
 * They are not crops of each other — each re-frames from the source, so a
 * vertical cut gets a camera that knows it is vertical rather than a 16:9
 * frame with the sides thrown away. See viewport.ts.
 */
const social = cutOf(CUTS.social);
const SocialCut: React.FC = () => (
  <Cut scenes={social.scenes} bed="music/bed-social.wav" />
);

export const Root: React.FC = () => (
  <>
    {/* The full walkthrough. Every feature, narrated. */}
    <Composition
      id="Demo"
      component={Demo}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={W}
      height={H}
    />

    {/* X, native upload. Landscape, and comfortably under the 2:20 cap. */}
    <Composition
      id="Short"
      component={SocialCut}
      durationInFrames={social.frames}
      fps={FPS}
      width={1920}
      height={1080}
    />

    {/* Instagram Reels and Stories, WhatsApp status. */}
    <Composition
      id="Reel"
      component={SocialCut}
      durationInFrames={social.frames}
      fps={FPS}
      width={1080}
      height={1920}
    />

    {/* Instagram feed, LinkedIn, Discord — where a square crops least. */}
    <Composition
      id="Square"
      component={SocialCut}
      durationInFrames={social.frames}
      fps={FPS}
      width={1080}
      height={1080}
    />

    {/* Silent, six seconds, meant to loop at 400px wide in a timeline. */}
    <Composition
      id="Loop"
      component={Loop}
      durationInFrames={Math.round(LOOP_SECONDS * FPS)}
      fps={FPS}
      width={1280}
      height={720}
    />

    {/* How a film gets on the release watch, both ways. Silent and labelled —
        a help loop for the store listing and the README, watched muted. */}
    <Composition
      id="AddFilm"
      component={AddFilm}
      durationInFrames={Math.round(ADD_FILM_SECONDS * FPS)}
      fps={FPS}
      width={1280}
      height={720}
    />
  </>
);
