import React from 'react';
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { eyeOf } from '../viewport';
import { C } from '../theme';
import { project, type Cam } from './Camera';

export type Key = { at: number; x: number; y: number };

/**
 * The pointer, and the reason the video is watchable without the sound.
 *
 * Two rules, both learned from watching demos that don't work: it decelerates
 * into every target rather than arriving at constant speed, and it *waits*
 * before it clicks. Natural mouse movement is unreadable on camera — the eye
 * needs to be told where to look before the thing it should look at changes.
 */
const REACH = Easing.bezier(0.32, 0.02, 0.18, 1);

export const at = (keys: Key[], t: number) => {
  if (keys.length === 1) return { x: keys[0].x, y: keys[0].y };
  const ats = keys.map((k) => k.at);
  const o = {
    extrapolateLeft: 'clamp' as const,
    extrapolateRight: 'clamp' as const,
    easing: REACH,
  };
  return {
    x: interpolate(t, ats, keys.map((k) => k.x), o),
    y: interpolate(t, ats, keys.map((k) => k.y), o),
  };
};

/**
 * A click: the ring the recording tools draw, because a bare pointer twitching
 * is not a visible event. The pointer dips slightly, which is what sells it as
 * a press rather than as a decoration that happened to appear.
 */
const Ring: React.FC<{ x: number; y: number; age: number }> = ({ x, y, age }) => {
  const o = { extrapolateLeft: 'clamp' as const, extrapolateRight: 'clamp' as const };
  const r = interpolate(age, [0, 0.42], [8, 46], { ...o, easing: Easing.out(Easing.quad) });
  const opacity = interpolate(age, [0, 0.1, 0.42], [0.55, 0.45, 0], o);
  return (
    <div
      style={{
        position: 'absolute',
        left: x - r,
        top: y - r,
        width: r * 2,
        height: r * 2,
        borderRadius: '50%',
        border: `3px solid ${C.open}`,
        opacity,
      }}
    />
  );
};

export const Cursor: React.FC<{
  cam: Cam;
  /** Keyed in plate coordinates, so a target stays on its field as the camera moves. */
  keys: Key[];
  clicks?: number[];
  hidden?: boolean;
}> = ({ cam, keys, clicks = [], hidden }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;
  if (hidden) return null;

  const p = project(cam, at(keys, t), eyeOf(width, height));
  const press = clicks.reduce((acc, c) => {
    const age = t - c;
    return age >= 0 && age < 0.16 ? Math.max(acc, 1 - age / 0.16) : acc;
  }, 0);
  const dip = press * 3;

  return (
    <>
      {clicks.map((c, i) => {
        const age = t - c;
        return age >= 0 && age < 0.42 ? (
          <Ring key={i} x={p.x} y={p.y} age={age} />
        ) : null;
      })}
      <svg
        width={34}
        height={44}
        viewBox="0 0 24 32"
        style={{
          position: 'absolute',
          left: p.x - 2 + dip,
          top: p.y - 1 + dip,
          filter: 'drop-shadow(0 2px 5px rgba(22,32,47,.34))',
        }}
      >
        {/* The macOS arrow: white fill, dark outline. A black cursor vanishes
            into the seat grid and a plain triangle reads as a play button. */}
        <path
          d="M2 1.6 L2 25.4 L8.1 19.6 L11.9 28.6 L15.9 26.9 L12.1 18.2 L20.4 18.0 Z"
          fill="#FFFFFF"
          stroke={C.ink}
          strokeWidth={1.6}
          strokeLinejoin="round"
        />
      </svg>
    </>
  );
};
