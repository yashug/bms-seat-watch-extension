import React from 'react';
import { AbsoluteFill, Audio, Img, Sequence, staticFile, useVideoConfig } from 'remotion';
import { C, SANS } from './theme';
import { bedFor } from './music';
import { Captions } from './components/Caption';
import { Hook, Why, Add, List } from './scenes/open';
import { Criteria, Position, Hall, Cadence, Alert } from './scenes/seats';
import { Release, Sleep, Venues, Elsewhere, Trust, Card } from './scenes/release';
import type { Scene } from './timeline';

const BY_ID: Record<string, React.FC<{ scene: Scene }>> = {
  hook: Hook,
  why: Why,
  add: Add,
  list: List,
  criteria: Criteria,
  position: Position,
  hall: Hall,
  cadence: Cadence,
  alert: Alert,
  release: Release,
  sleep: Sleep,
  venues: Venues,
  elsewhere: Elsewhere,
  trust: Trust,
  card: Card,
};

/**
 * One cut of the video: a list of scenes and a score.
 *
 * Every cut keeps both the narration and the burned-in captions. Autoplay is
 * muted on all of these platforms, so the captions have to carry it alone — but
 * the people who do turn the sound on should get the voice rather than a
 * silent video with music over it.
 */
/**
 * The lockup that closes a tall or square frame.
 *
 * Only on the social cuts, and only because those frames have a bottom third
 * that would otherwise be empty paper. A wide cut ends on its end card and
 * needs no watermark; a Reel is watched in a feed with no title, no
 * description and no link, so the name has to be in the picture.
 */
const Lockup: React.FC = () => {
  const { width, height } = useVideoConfig();
  if (width / height >= 1.35) return null;
  const size = Math.round(width * 0.03);
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: Math.round(height * 0.055),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: size * 0.55,
        opacity: 0.92,
      }}
    >
      <Img
        src={staticFile('icon128.png')}
        style={{ width: size * 1.7, height: size * 1.7, borderRadius: size * 0.38 }}
      />
      <div style={{ textAlign: 'left' }}>
        <div style={{ font: `700 ${size}px/1.15 ${SANS}`, letterSpacing: '-.02em', color: C.ink }}>
          Seat Watch
        </div>
        <div style={{ marginTop: size * 0.14, font: `500 ${size * 0.66}px/1.15 ${SANS}`, color: C.ink2 }}>
          Free · Chrome Web Store
        </div>
      </div>
    </div>
  );
};

export const Cut: React.FC<{
  scenes: Scene[];
  /** Which score to play. Each cut gets its own: an arrangement written for a
   *  2m44s tour, played under a 60s one, never reaches the part that resolves
   *  and simply stops when the video does. */
  bed: string;
}> = ({ scenes, bed }) => (
  <AbsoluteFill style={{ background: '#F4F6FA' }}>
    <Audio src={staticFile(bed)} volume={bedFor(scenes)} />
    {scenes.map((scene) => {
      const Body = BY_ID[scene.id];
      if (!Body) {
        throw new Error(`Scene "${scene.id}" has nothing to render it.`);
      }
      return (
        <Sequence
          key={scene.id}
          from={scene.start}
          durationInFrames={scene.frames}
          name={scene.id}
          layout="none"
        >
          <AbsoluteFill>
            <Body scene={scene} />
            <Captions captions={scene.captions} sceneFrames={scene.frames} />
            {/* The end card already says all of this, at its own size. */}
            {scene.id === 'card' ? null : <Lockup />}
            <Audio src={staticFile(`vo/${scene.id}.wav`)} />
          </AbsoluteFill>
        </Sequence>
      );
    })}
  </AbsoluteFill>
);
