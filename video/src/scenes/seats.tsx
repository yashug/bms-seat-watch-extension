import React from 'react';
import { Stage } from '../components/Stage';
import { Camera, grow, move, union } from '../components/Camera';
import { Cursor } from '../components/Cursor';
import { Notification, NOTIFY, NOTIFY_H } from '../components/Props';
import { PopupIn, Shot, inPopup, popupFrame } from '../components/Plate';
import { centre, column, rect } from '../states';
import { useT, len, swap, ramp } from './common';
import { useEye } from '../viewport';
import type { Scene } from '../timeline';

/** The settings page, laid on the stage as a document for the camera to fly
 *  over. No browser window: it is a page, it needs no frame to be legible, and
 *  a frame would only fight a camera that pans two thousand pixels down it. */
const Page: React.FC<{ name: string; under?: string; mix?: number }> = ({
  name,
  under,
  mix = 0,
}) => (
  <>
    {under ? <Shot name={under} radius={16} shadow /> : null}
    <Shot name={name} radius={16} shadow opacity={under ? mix : 1} />
  </>
);

/* ----------------------------------------------------------- 5. criteria ---
 * Seats together, changed from 2 to 4 on camera. The two stills either side of
 * the click are the same page rendered with different stored defaults, so the
 * number really does change — nothing is drawn over the screenshot.
 */
export const Criteria: React.FC<{ scene: Scene }> = ({ scene }) => {
  const t = useT();
  const { eye, fit, fitCol } = useEye();
  const CLICK = 5.6;
  const col = column('opt-seats-loose');
  const field = rect('opt-seats-loose', '#minAdj');
  const pair = union(field, rect('opt-seats-loose', '#skipfront'));
  const cam = move(t, [
    { at: 0, cam: fitCol(col, pair, 230, 110) },
    { at: len(scene), cam: fitCol(col, field, 62, 78) },
  ]);
  const p = centre('opt-seats-loose', '#minAdj');
  return (
    <Stage>
      <Camera cam={cam}>
        <Page name="opt-seats-tight" under="opt-seats-loose" mix={swap(t, CLICK)} />
      </Camera>
      <Cursor
        cam={cam}
        keys={[
          { at: 0, x: p.x + 330, y: p.y + 190 },
          { at: CLICK - 0.75, x: p.x + 96, y: p.y },
          { at: len(scene), x: p.x + 96, y: p.y },
        ]}
        clicks={[CLICK]}
      />
    </Stage>
  );
};

/* ----------------------------------------------------------- 6. position ---
 * The setting that decides whether an alert is worth acting on. The page is
 * already showing the tightened defaults, so the pan lands on choices that are
 * made rather than on empty selects.
 */
export const Position: React.FC<{ scene: Scene }> = ({ scene }) => {
  const t = useT();
  const { eye, fit, fitCol } = useEye();
  const col = column('opt-seats-tight');
  const skip = rect('opt-seats-tight', '#skipfront');
  const where = rect('opt-seats-tight', '#where');
  const cam = move(t, [
    { at: 0, cam: fitCol(col, skip, 62, 92) },
    { at: 4.6, cam: fitCol(col, where, 68, 96) },
    { at: len(scene), cam: fitCol(col, union(where, skip), 74, 120) },
  ]);
  const ps = centre('opt-seats-tight', '#skipfront');
  const pw = centre('opt-seats-tight', '#where');
  return (
    <Stage>
      <Camera cam={cam}>
        <Page name="opt-seats-tight" />
      </Camera>
      <Cursor
        cam={cam}
        keys={[
          { at: 0, x: ps.x + 110, y: ps.y },
          { at: 1.4, x: ps.x + 110, y: ps.y },
          { at: 4.0, x: pw.x + 250, y: pw.y },
          { at: len(scene), x: pw.x + 250, y: pw.y },
        ]}
        clicks={[1.6, 4.4]}
      />
    </Stage>
  );
};

/* --------------------------------------------------------------- 7. hall ---
 * The strongest single frame in the video: four green seats joined by a band.
 * The camera holds on the map long enough to read it, then pulls back onto the
 * counts and the trend line, which is the order the eye wants them in.
 */
export const Hall: React.FC<{ scene: Scene }> = ({ scene }) => {
  const t = useT();
  const { eye, fit, fitCol } = useEye();
  const map = inPopup(rect('popup-one', '.map'));
  const hall = inPopup(rect('popup-one', '.hall'));
  const counts = inPopup(union(rect('popup-one', '.caption'), rect('popup-one', '.trend')));
  const cam = move(t, [
    { at: 0, cam: fit(popupFrame('popup-one', eye), 0) },
    { at: 2.4, cam: fit(grow(hall, 26, 30), 28, 3.2) },
    { at: 5.2, cam: fit(grow(map, 14, 16), 18, 3.8) },
    { at: 8.6, cam: fit(grow(map, 14, 16), 18, 3.8) },
    { at: len(scene), cam: fit(grow(union(hall, counts), 34, 30), 28) },
  ]);
  return (
    <Stage>
      <Camera cam={cam}>
        <PopupIn name="popup-one" badge="1" />
      </Camera>
    </Stage>
  );
};

/* ------------------------------------------------------------ 8. cadence ---
 * The check ladder, ending on the band the whole product exists for: under
 * three hours, when seats get released.
 */
export const Cadence: React.FC<{ scene: Scene }> = ({ scene }) => {
  const t = useT();
  const { eye, fit, fitCol } = useEye();
  const ladder = rect('opt-seats-loose', '.ladder');
  const hot = rect('opt-seats-loose', '.ladder li.hot');
  const col = column('opt-seats-loose');
  const cam = move(t, [
    { at: 0, cam: fitCol(col, ladder, 62, 20) },
    { at: 5.4, cam: fitCol(col, ladder, 62, 20) },
    { at: len(scene), cam: fitCol(col, hot, 44, 48) },
  ]);
  return (
    <Stage>
      <Camera cam={cam}>
        <Page name="opt-seats-loose" />
      </Camera>
      <Cursor
        cam={cam}
        keys={[
          { at: 0, x: ladder.x + ladder.w + 90, y: ladder.y + 40 },
          { at: 5.0, x: ladder.x + ladder.w + 90, y: ladder.y + 40 },
          { at: 7.4, x: hot.x + hot.w - 40, y: hot.y + hot.h / 2 },
          { at: len(scene), x: hot.x + hot.w - 40, y: hot.y + hot.h / 2 },
        ]}
      />
    </Stage>
  );
};

/* -------------------------------------------------------------- 9. alert ---
 * The notification, then the popup's own record of what it found. The strings
 * are the ones background.js sends; the block list underneath is the same find,
 * rendered by the popup's own code.
 */
export const Alert: React.FC<{ scene: Scene }> = ({ scene }) => {
  const t = useT();
  const { eye, fit, fitCol } = useEye();
  const CLICK = 5.2;
  const wide = fit(popupFrame('popup-hit', eye), 0);
  const blocks = inPopup(rect('popup-hit', '.blocks'));
  const book = inPopup(rect('popup-hit', '.head .open'));
  // The banner is 372px on a 1440px plate. Left at the establishing width it
  // is a grey smudge in the corner for four seconds — and it is the thing the
  // scene is about, as well as the only frame of this video that survives being
  // cropped into a six-second loop.
  const banner_r = { x: NOTIFY.x, y: NOTIFY.y, w: NOTIFY.w, h: NOTIFY_H };
  const close = fit(grow(banner_r, 54, 46), 30, 2.3);
  const cam = move(t, [
    { at: 0, cam: wide },
    { at: 0.9, cam: wide },
    { at: 2.3, cam: close },
    { at: CLICK + 0.5, cam: close },
    { at: CLICK + 1.6, cam: wide },
    { at: 8.2, cam: fit(grow(blocks, 34, 28), 26, 3.0) },
    { at: len(scene), cam: fit(grow(blocks, 34, 28), 26, 3.0) },
  ]);
  // The pointer works in plate coordinates, and the notification is drawn on
  // the plate too, so the click lands on the banner rather than near it.
  const banner = { x: NOTIFY.x + NOTIFY.w / 2, y: NOTIFY.y + 52 };
  return (
    <Stage>
      <Camera cam={cam}>
        <PopupIn name="popup-hit" badge="3" reveal={ramp(t, CLICK, CLICK + 0.3)} />
        <Notification
          t={t}
          at={0.7}
          gone={CLICK + 0.25}
          title="Seats open — Spider-Man: Brand New Day · English"
          message="F 8–13 · 6 together · ₹240"
          buttons={['Open seats', 'Snooze 20m']}
        />
      </Camera>
      <Cursor
        cam={cam}
        keys={[
          { at: 0, x: 700, y: 560 },
          { at: 2.0, x: 700, y: 560 },
          { at: CLICK - 0.7, x: banner.x, y: banner.y },
          { at: CLICK + 0.8, x: banner.x, y: banner.y },
          { at: 8.6, x: blocks.x + 120, y: blocks.y + 16 },
          { at: len(scene), x: blocks.x + 120, y: blocks.y + 16 },
        ]}
        clicks={[CLICK]}
      />
    </Stage>
  );
};
