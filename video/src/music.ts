/**
 * How loud the music is, frame by frame.
 *
 * A bed at one level for the whole video is either too loud to talk over or too
 * quiet to be worth having. This ducks it under every spoken line and lets it
 * back up in the gaps — which are exactly the `hold` seconds each scene already
 * declares, so the ducking is derived from the cut rather than drawn by hand.
 *
 * The curve is then smoothed over about half a second. A step change in gain on
 * a sustained pad is audible as a pump, and the ear notices it precisely
 * because the pad has nothing else going on.
 */
import { FPS } from './theme';
import type { Scene } from './timeline';

const UNDER_SPEECH = 0.17;
const IN_GAPS = 0.36;
/** The end card is the one place the music is the point. */
const CARD = 0.62;

const SMOOTH = Math.round(FPS * 0.55);

/** A box blur, run twice. One pass leaves corners the ear can still hear on a
 *  pad; two is a good enough approximation of a gentle release. */
const blur = (src: Float32Array, radius: number) => {
  const out = new Float32Array(src.length);
  for (let i = 0; i < src.length; i++) {
    let sum = 0;
    for (let j = i - radius; j <= i + radius; j++) {
      sum += src[Math.min(src.length - 1, Math.max(0, j))];
    }
    out[i] = sum / (radius * 2 + 1);
  }
  return out;
};

/** Built per cut, not once: the social cuts drop the middle of the tour, so a
 *  curve indexed by the master's frames would duck at the wrong moments. */
export const bedFor = (scenes: Scene[]) => {
  const total = scenes.reduce((n, s) => Math.max(n, s.start + s.frames), 0);
  const targets = new Float32Array(total);
  targets.fill(IN_GAPS);
  for (const scene of scenes) {
    const speechEnd = scene.start + Math.round(scene.speech * FPS);
    const end = scene.start + scene.frames;
    const gap = scene.id === 'card' ? CARD : IN_GAPS;
    for (let f = scene.start; f < end && f < total; f++) {
      targets[f] = f < speechEnd ? UNDER_SPEECH : gap;
    }
  }
  const curve = blur(blur(targets, SMOOTH), SMOOTH);
  return (frame: number) => curve[Math.min(curve.length - 1, Math.max(0, frame))];
};
