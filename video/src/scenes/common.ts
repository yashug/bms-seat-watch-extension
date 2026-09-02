import { interpolate, useCurrentFrame, useVideoConfig, Easing } from 'remotion';
import type { Scene } from '../timeline';

export const useT = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return frame / fps;
};

/** A 0..1 ramp between two times, eased. Used for everything that appears. */
export const ramp = (t: number, from: number, to: number) =>
  interpolate(t, [from, to], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.3, 0, 0.2, 1),
  });

/** Seconds of scene. */
export const len = (s: Scene) => s.speech + s.hold;

/**
 * A cut inside a scene: two rendered states of the same screen, cross-faded
 * over four frames at the moment of the click. Short enough to read as the
 * interface responding rather than as an edit — a slow dissolve here looks
 * like a transition and breaks the illusion that anything was clicked.
 */
export const swap = (t: number, at: number, over = 0.13) =>
  interpolate(t, [at, at + over], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
