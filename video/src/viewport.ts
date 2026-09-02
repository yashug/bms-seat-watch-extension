/**
 * Where the camera points, per shape of frame.
 *
 * The video is cut three ways — 16:9 for X, 9:16 for Reels, 1:1 for a feed —
 * and they are not crops of each other. A 1920×1080 frame of a 384px popup has
 * room for the browser window around it; a 1080×1920 frame does not, and
 * showing the window anyway would render the panel at two thirds the size for
 * no gain. So the shape of the frame decides how close the camera gets, and
 * every scene asks rather than assuming.
 */
import { useVideoConfig } from 'remotion';
import type { Cam, Rect } from './components/Camera';

export type Eye = {
  w: number;
  h: number;
  /** Where a focused point lands. Above centre — the bottom band is captions. */
  eyeX: number;
  eyeY: number;
  /** How much room the artwork may take before that band starts. */
  safeW: number;
  safeH: number;
  portrait: boolean;
};

export const eyeOf = (w: number, h: number): Eye => {
  const aspect = w / h;
  if (aspect < 0.85) {
    // Tall. A 720px-wide card in a 1080px-wide frame is a band whichever way
    // the camera is pointed — there is no zoom that fills 1920px of height with
    // it. So the frame is laid out instead: the caption goes big across the
    // top, the product sits in the middle, a lockup closes the bottom. That is
    // the shape these are made in, and the artwork gets the middle third.
    return { w, h, eyeX: w / 2, eyeY: h * 0.515, safeW: w * 0.93, safeH: h * 0.55,
             portrait: true };
  }
  if (aspect < 1.35) {
    return { w, h, eyeX: w / 2, eyeY: h * 0.525, safeW: w * 0.93, safeH: h * 0.55,
             portrait: false };
  }
  return { w, h, eyeX: w / 2, eyeY: h * 0.4315, safeW: w * 0.885, safeH: h * 0.752,
           portrait: false };
};

/** The width the pads in the scenes were written against. A pad is breathing
 *  room in frame-widths, not in plate pixels: 120 of it around a 720px card is
 *  a comfortable margin on a 1700px-wide stage and a third of the frame thrown
 *  away on a 1004px one. */
const PAD_BASIS = 1700;

export const fitIn = (eye: Eye, r: Rect, pad = 40, maxScale = 3.4): Cam => {
  const p = pad * (eye.safeW / PAD_BASIS);
  const w = r.w + p * 2;
  const h = r.h + p * 2;
  return {
    x: r.x + r.w / 2,
    y: r.y + r.h / 2,
    scale: Math.min(eye.safeW / w, eye.safeH / h, maxScale),
  };
};

/**
 * The settings page framed on its content column rather than on the field.
 *
 * A 300px input is not centred in the 612px column it sits in, so framing it on
 * its own midpoint pushes the other half of the row out of shot and cuts a
 * label in half. Vertical interest from the element, horizontal extent from the
 * column: the only framing that cannot clip text.
 */
export const fitColIn = (
  eye: Eye,
  col: Rect,
  r: Rect,
  padTop = 44,
  padBottom = padTop,
  maxScale = 2.6
): Cam =>
  fitIn(eye, { x: col.x, y: r.y - padTop, w: col.w, h: r.h + padTop + padBottom },
        36, maxScale);


export const useEye = () => {
  const { width, height } = useVideoConfig();
  const eye = eyeOf(width, height);
  return {
    eye,
    fit: (r: Rect, pad?: number, maxScale?: number) => fitIn(eye, r, pad, maxScale),
    fitCol: (col: Rect, r: Rect, padTop?: number, padBottom?: number, maxScale?: number) =>
      fitColIn(eye, col, r, padTop, padBottom, maxScale),
  };
};
