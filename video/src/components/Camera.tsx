import React from 'react';
import { interpolate, Easing, useVideoConfig } from 'remotion';
import { eyeOf } from '../viewport';

/**
 * A camera over a flat plate.
 *
 * Everything the video shows is drawn once, at its own natural size, in plate
 * coordinates — a 384px popup is 384px, a settings field is where the browser
 * put it. The camera then decides which part of that is on screen. Zooming is
 * therefore a property of the shot rather than of the artwork, which is what
 * lets the same still serve a wide establishing frame and a close-up on one
 * input without being re-rendered.
 */
export type Cam = {
  /** The plate point that lands at the eye position. */
  x: number;
  y: number;
  scale: number;
};

export type Rect = { x: number; y: number; w: number; h: number };

/** Grow a rect — for framing a field together with its label and hint. */
export const grow = (r: Rect, top = 0, right = 0, bottom = top, left = right): Rect => ({
  x: r.x - left,
  y: r.y - top,
  w: r.w + left + right,
  h: r.h + top + bottom,
});

export const union = (...rs: Rect[]): Rect => {
  const x = Math.min(...rs.map((r) => r.x));
  const y = Math.min(...rs.map((r) => r.y));
  const x2 = Math.max(...rs.map((r) => r.x + r.w));
  const y2 = Math.max(...rs.map((r) => r.y + r.h));
  return { x, y, w: x2 - x, h: y2 - y };
};

const EASE = Easing.bezier(0.42, 0, 0.26, 1);

/**
 * A move between camera positions, keyed in seconds.
 *
 * Scale is interpolated in log space: linear scale reads as a lurch that
 * decelerates hard at the end, because what the eye tracks is the rate of
 * magnification, not the magnification.
 */
export const move = (
  t: number,
  keys: { at: number; cam: Cam }[]
): Cam => {
  if (keys.length === 1) return keys[0].cam;
  const ats = keys.map((k) => k.at);
  return {
    x: interpolate(t, ats, keys.map((k) => k.cam.x), {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE,
    }),
    y: interpolate(t, ats, keys.map((k) => k.cam.y), {
      extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE,
    }),
    scale: Math.exp(
      interpolate(t, ats, keys.map((k) => Math.log(k.cam.scale)), {
        extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE,
      })
    ),
  };
};

/** A slow drift, so a held shot is never completely dead. */
export const drift = (cam: Cam, t: number, seconds: number, by = 0.035): Cam => ({
  ...cam,
  scale: cam.scale * (1 + (by * t) / Math.max(seconds, 0.001)),
});

/** Plate coordinates -> stage coordinates, for anything drawn outside the
 *  camera that still has to point at something inside it (the cursor). */
export const project = (
  cam: Cam,
  p: { x: number; y: number },
  eye: { eyeX: number; eyeY: number }
) => ({
  x: (p.x - cam.x) * cam.scale + eye.eyeX,
  y: (p.y - cam.y) * cam.scale + eye.eyeY,
});

export const Camera: React.FC<{ cam: Cam; children: React.ReactNode }> = ({
  cam,
  children,
}) => {
  const { width, height } = useVideoConfig();
  const eye = eyeOf(width, height);
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        transformOrigin: '0 0',
        transform: `translate(${eye.eyeX}px, ${eye.eyeY}px) scale(${cam.scale}) translate(${-cam.x}px, ${-cam.y}px)`,
        willChange: 'transform',
      }}
    >
      {children}
    </div>
  );
};

