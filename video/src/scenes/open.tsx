import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Stage } from '../components/Stage';
import { Camera, grow, move, union, drift } from '../components/Camera';
import { Cursor } from '../components/Cursor';
import { ChipRow, CHIP_ROW, chipPlus, chipBox, Toast, type ChipState } from '../components/Props';
import { PopupIn, EXT_CENTRE, inPopup, popupFrame } from '../components/Plate';
import { rect } from '../states';
import { useT, ramp, len, swap } from './common';
import { useEye } from '../viewport';
import type { Scene } from '../timeline';

const CINEMA = 'ALLU Cinemas: Kokapet';

/** Four showtimes; the second one is the one that quietly comes back on sale. */
const chips = (freed: boolean): ChipState[] => [
  { time: '03:15 PM', screen: 'SCREEN 4', sold: true },
  { time: '07:40 PM', screen: 'SCREEN 1', sold: !freed },
  { time: '10:20 PM', screen: 'SCREEN 4', sold: true },
  { time: '11:55 PM', screen: 'SCREEN 2', sold: true },
];

/* --------------------------------------------------------------- 1. hook ---
 * No product, no branding, no logo. Three seconds of grey chips and a claim the
 * viewer does not believe yet. The extension does not appear until scene three,
 * which is deliberate: by then the problem has been agreed to, so the product
 * arrives as the answer rather than as an ad.
 */
export const Hook: React.FC<{ scene: Scene }> = ({ scene }) => {
  const t = useT();
  const { eye, fit, fitCol } = useEye();
  const wide = fit(CHIP_ROW, 120);
  const cam = drift(wide, t, len(scene), 0.05);
  return (
    <Stage tint="rgba(22,32,47,.05)">
      <Camera cam={cam}>
        <ChipRow cinema={CINEMA} chips={chips(false)} />
      </Camera>
    </Stage>
  );
};

/* ---------------------------------------------------------------- 2. why ---
 * The turn, and the most valuable seconds in the video: a sold-out chip comes
 * back on sale on camera while the narration explains that nothing announces
 * it. This beat is shareable without the product attached, which is exactly
 * why it earns fourteen seconds.
 */
export const Why: React.FC<{ scene: Scene }> = ({ scene }) => {
  const t = useT();
  const { eye, fit, fitCol } = useEye();
  const freeAt = 8.4;
  const cam = move(t, [
    { at: 0, cam: fit(CHIP_ROW, 120) },
    { at: len(scene), cam: fit(grow(CHIP_ROW, 40, 30), 62) },
  ]);
  // Cross-fade the row rather than toggling it: the chip has to be seen
  // changing, and a hard swap at 30fps is a single frame nobody registers.
  const freed = swap(t, freeAt, 0.55);
  return (
    <Stage tint="rgba(22,32,47,.05)">
      <Camera cam={cam}>
        <ChipRow cinema={CINEMA} chips={chips(false)} />
        <div style={{ position: 'absolute', inset: 0, opacity: freed }}>
          <ChipRow cinema={CINEMA} chips={chips(true)} />
        </div>
      </Camera>
    </Stage>
  );
};

/* ---------------------------------------------------------------- 3. add ---
 * The shot that sells the extension: its own + button sitting on a showtime,
 * clicked on a sold-out one.
 */
export const Add: React.FC<{ scene: Scene }> = ({ scene }) => {
  const t = useT();
  const { eye, fit, fitCol } = useEye();
  const CLICK = 5.5;
  const target = chipPlus(2);
  const plus = ramp(t, 0.7, 1.5);
  const cam = move(t, [
    { at: 0, cam: fit(grow(CHIP_ROW, 40, 30), 62) },
    { at: 3.4, cam: fit(CHIP_ROW, 52) },
    { at: len(scene), cam: fit(CHIP_ROW, 34) },
  ]);
  const hover = ramp(t, CLICK - 0.7, CLICK - 0.15);
  const ticked = t >= CLICK;
  return (
    <Stage tint="rgba(22,32,47,.05)">
      <Camera cam={cam}>
        <ChipRow
          cinema={CINEMA}
          chips={chips(true)}
          plus={plus}
          tickIndex={ticked ? 2 : -1}
          hoverIndex={2}
          hover={hover}
        />
        <Toast text="Watching this show" show={ramp(t, CLICK + 0.15, CLICK + 0.55)} />
      </Camera>
      <Cursor
        cam={cam}
        keys={[
          { at: 0, x: 700, y: 300 },
          { at: 2.6, x: 700, y: 300 },
          { at: CLICK - 0.6, x: target.x, y: target.y },
          { at: len(scene), x: target.x, y: target.y },
        ]}
        clicks={[CLICK]}
      />
    </Stage>
  );
};

/* --------------------------------------------------------------- 4. list ---
 * Arriving at the popup by clicking the pinned icon, so the panel is placed
 * before anything is said about what is in it.
 */
export const List: React.FC<{ scene: Scene }> = ({ scene }) => {
  const t = useT();
  const { eye, fit, fitCol } = useEye();
  const OPEN = 1.5;
  const wide = fit(popupFrame('popup-one', eye), 0);
  const head = inPopup(union(rect('popup-one', '.name'), rect('popup-one', '.head .open')));
  const cam = move(t, [
    { at: 0, cam: wide },
    { at: OPEN + 0.4, cam: wide },
    { at: OPEN + 2.0, cam: fit(grow(head, 40, 22, 168, 22), 34, 2.6) },
    { at: len(scene), cam: fit(grow(head, 34, 20, 140, 20), 34, 2.9) },
  ]);
  return (
    <Stage>
      <Camera cam={cam}>
        <PopupIn name="popup-one" badge="1" reveal={ramp(t, OPEN, OPEN + 0.3)} />
      </Camera>
      <Cursor
        cam={cam}
        keys={[
          { at: 0, x: 900, y: 420 },
          { at: OPEN - 0.6, x: EXT_CENTRE.x, y: EXT_CENTRE.y },
          { at: OPEN + 0.9, x: EXT_CENTRE.x, y: EXT_CENTRE.y },
          { at: len(scene), x: EXT_CENTRE.x - 46, y: EXT_CENTRE.y - 34 },
        ]}
        clicks={[OPEN]}
        hidden={t > OPEN + 1.7}
      />
    </Stage>
  );
};
