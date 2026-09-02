/**
 * The rendered interface, and where everything in it is.
 *
 * build-states.sh shoots each state from the extension's own code and records
 * the rect of every element the video points at. Scenes ask for a selector, not
 * for a pixel offset — so when the settings page grows a field next year, the
 * close-up moves with it instead of landing on the wrong control.
 */
import { staticFile } from 'remotion';
import raw from '../public/states/states.json';
import type { Rect } from './components/Camera';

type State = {
  w: number;
  h: number;
  scale: number;
  rects: Record<string, { x: number; y: number; w: number; h: number }>;
};

const STATES = raw as unknown as Record<string, State>;

export const state = (name: string): State => {
  const s = STATES[name];
  if (!s) throw new Error(`Unknown UI state "${name}". Run: npm run states`);
  return s;
};

export const src = (name: string) => staticFile(`states/${name}.png`);

/** A measured element, in the artwork's own coordinates. */
export const rect = (name: string, selector: string): Rect => {
  const r = state(name).rects[selector];
  if (!r) {
    throw new Error(
      `"${selector}" was not measured in "${name}". ` +
        `Add it to the rect list in video/shots/make-states.py and rebuild.`
    );
  }
  return r;
};

/** The centre of a measured element — where the pointer goes. */
export const centre = (name: string, selector: string) => {
  const r = rect(name, selector);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
};

export const whole = (name: string): Rect => {
  const s = state(name);
  return { x: 0, y: 0, w: s.w, h: s.h };
};

/**
 * The settings page's content column, taken as the widest thing measured on
 * that page. Deriving it beats hard-coding 612px at x=214: those numbers are a
 * consequence of the window width the stills happen to be shot at, and shooting
 * them wider next year would silently put every close-up off-centre.
 */
export const column = (name: string): Rect => {
  const rs = Object.values(state(name).rects);
  if (!rs.length) throw new Error(`"${name}" has no measured rects.`);
  const widest = rs.reduce((a, b) => (b.w > a.w ? b : a));
  return { x: widest.x, y: 0, w: widest.w, h: 0 };
};
