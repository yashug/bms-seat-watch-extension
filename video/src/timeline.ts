/**
 * Scene lengths come from the narration, not the other way round.
 *
 * build-voice.sh measures each rendered line and writes vo.json; a scene is
 * that measurement plus its hold. So rewriting a line and rebuilding moves
 * everything after it automatically, and no scene is ever cut off mid-sentence
 * because someone guessed six seconds and it came out eight.
 */
import script from '../script.json';
import vo from '../public/vo/vo.json';
import { FPS } from './theme';

export type Caption = [text: string, atSeconds: number];

export type Scene = {
  id: string;
  vo: string;
  captions: Caption[];
  hold: number;
  /** Seconds of narration, measured from the rendered audio. */
  speech: number;
  frames: number;
  /** First frame of the scene in the full timeline. */
  start: number;
};

const durations = vo.durations as Record<string, number>;

let cursor = 0;
export const SCENES: Scene[] = script.scenes.map((s) => {
  const speech = durations[s.id];
  if (speech === undefined) {
    throw new Error(
      `No narration for scene "${s.id}". Run: npm run voice`
    );
  }
  const frames = Math.ceil((speech + s.hold) * FPS);
  const scene: Scene = {
    id: s.id,
    vo: s.vo,
    captions: (s.captions ?? []) as Caption[],
    hold: s.hold,
    speech,
    frames,
    start: cursor,
  };
  cursor += frames;
  return scene;
});

export const TOTAL_FRAMES = cursor;

export const sceneById = (id: string): Scene => {
  const s = SCENES.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown scene: ${id}`);
  return s;
};

/**
 * A subset of the scenes, re-based to start at zero.
 *
 * The short cuts are not crops of the master — they are the same scenes with
 * the middle of the tour dropped, so each one still runs at the length its own
 * narration needs. Re-basing here rather than in the composition keeps the
 * scene components unaware that they are ever in anything but the full video.
 */
export const cutOf = (ids: string[]) => {
  let at = 0;
  const scenes = ids.map((id) => {
    const s = sceneById(id);
    const out = { ...s, start: at };
    at += s.frames;
    return out;
  });
  return { scenes, frames: at };
};

/** Named in script.json so the score builder cuts to the same list. */
export const CUTS = script.cuts as Record<string, string[]>;
