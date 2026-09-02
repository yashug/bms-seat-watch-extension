import React from 'react';
import { Stage } from '../components/Stage';
import { C, SANS } from '../theme';
import { Camera, grow, move, union, drift } from '../components/Camera';
import { Cursor } from '../components/Cursor';
import { EndCard } from '../components/Props';
import { PopupIn, Shot, inPopup, popupFrame } from '../components/Plate';
import { centre, column, rect, state } from '../states';
import { useT, len, ramp, swap } from './common';
import { useEye } from '../viewport';
import type { Scene } from '../timeline';

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

/* ------------------------------------------------------------ 10. release ---
 * The other half of the product. Two shots: the bell, and the films already
 * being watched sitting above the seat cards in the popup — which is where the
 * two halves meet.
 */
export const Release: React.FC<{ scene: Scene }> = ({ scene }) => {
  const t = useT();
  const { eye, fit, fitCol } = useEye();
  const CUT = 9.6;
  const col = column('opt-release');
  const howto = rect('opt-release', '#panel-release .howto');
  const films = inPopup(rect('popup-films', '.up'));

  const camA = move(t, [
    { at: 0, cam: fitCol(col, howto, 120, 40) },
    { at: CUT, cam: fitCol(col, howto, 46, 46) },
  ]);
  const camB = move(t, [
    { at: CUT, cam: fit(popupFrame('popup-films', eye), 0) },
    { at: len(scene), cam: fit(grow(films, 34, 28), 28, 3.0) },
  ]);
  const cut = swap(t, CUT, 0.35);
  const cam = t < CUT ? camA : camB;
  const bell = { x: howto.x + 60, y: howto.y + 66 };

  return (
    <Stage tint="rgba(185,130,42,.10)">
      <div style={{ position: 'absolute', inset: 0, opacity: 1 - cut }}>
        <Camera cam={camA}>
          <Page name="opt-release" />
        </Camera>
      </div>
      <div style={{ position: 'absolute', inset: 0, opacity: cut }}>
        <Camera cam={camB}>
          <PopupIn name="popup-films" badge="2" />
        </Camera>
      </div>
      {t < CUT - 0.2 ? (
        <Cursor
          cam={camA}
          keys={[
            { at: 0, x: bell.x + 420, y: bell.y + 130 },
            { at: 4.2, x: bell.x, y: bell.y },
            { at: CUT, x: bell.x, y: bell.y },
          ]}
          clicks={[4.5]}
        />
      ) : null}
    </Stage>
  );
};

/* -------------------------------------------------------------- 11. sleep ---
 * Why watching a film three months out costs nothing: it doesn't start.
 */
export const Sleep: React.FC<{ scene: Scene }> = ({ scene }) => {
  const t = useT();
  const { eye, fit, fitCol } = useEye();
  const dorm = rect('opt-release', '#relDormancy');
  const prem = rect('opt-release', '#relPremiere');
  const both = union(dorm, prem);
  const col = column('opt-release');
  const cam = move(t, [
    { at: 0, cam: fitCol(col, both, 74, 150) },
    { at: 4.8, cam: fitCol(col, dorm, 58, 62) },
    { at: len(scene), cam: fitCol(col, prem, 58, 140) },
  ]);
  const pd = centre('opt-release', '#relDormancy');
  const pp = centre('opt-release', '#relPremiere');
  return (
    <Stage tint="rgba(185,130,42,.10)">
      <Camera cam={cam}>
        <Page name="opt-release" />
      </Camera>
      <Cursor
        cam={cam}
        keys={[
          { at: 0, x: pd.x + 260, y: pd.y + 150 },
          { at: 3.6, x: pd.x + 30, y: pd.y },
          { at: 5.4, x: pd.x + 30, y: pd.y },
          { at: 7.4, x: pp.x + 30, y: pp.y },
          { at: len(scene), x: pp.x + 30, y: pp.y },
        ]}
        clicks={[3.9, 7.7]}
      />
    </Stage>
  );
};

/* ------------------------------------------------------------- 12. venues ---
 * Your cinemas, so the alert can name which of them opened.
 */
export const Venues: React.FC<{ scene: Scene }> = ({ scene }) => {
  const t = useT();
  const { eye, fit, fitCol } = useEye();
  const box = rect('opt-release', '.venuebox');
  const list = rect('opt-release', '#venues');
  const col = column('opt-release');
  const cam = move(t, [
    { at: 0, cam: fitCol(col, box, 130, 46) },
    { at: len(scene), cam: fitCol(col, list, 34, 40) },
  ]);
  return (
    <Stage tint="rgba(185,130,42,.10)">
      <Camera cam={cam}>
        <Page name="opt-release" />
      </Camera>
      <Cursor
        cam={cam}
        keys={[
          { at: 0, x: list.x + list.w - 60, y: list.y - 40 },
          { at: 2.2, x: list.x + 90, y: list.y + 34 },
          { at: 4.0, x: list.x + 90, y: list.y + 88 },
          { at: len(scene), x: list.x + 90, y: list.y + 88 },
        ]}
        clicks={[2.5, 4.3]}
      />
    </Stage>
  );
};

/* ---------------------------------------------------------- 13. elsewhere ---
 * Where the alert reaches you when you are not at the desk. The panel fills in
 * on camera — the two stills are the same page with and without a bot token.
 */
export const Elsewhere: React.FC<{ scene: Scene }> = ({ scene }) => {
  const t = useT();
  const { eye, fit, fitCol } = useEye();
  const FILL = 8.2;
  const hook = rect('opt-alerts-empty', '#hook');
  const hookRow = union(hook, rect('opt-alerts-empty', '#hookTest'));
  const tg = union(rect('opt-alerts-set', '#token'), rect('opt-alerts-set', '#detect'));
  const col = column('opt-alerts-set');
  const cam = move(t, [
    { at: 0, cam: fitCol(col, hookRow, 130, 110) },
    { at: 4.6, cam: fitCol(col, hookRow, 58, 84) },
    { at: 8.0, cam: fitCol(col, tg, 120, 130) },
    { at: len(scene), cam: fitCol(col, tg, 66, 104) },
  ]);
  const find = centre('opt-alerts-set', '#detect');
  return (
    <Stage>
      <Camera cam={cam}>
        <Page name="opt-alerts-set" under="opt-alerts-empty" mix={swap(t, FILL, 0.4)} />
      </Camera>
      <Cursor
        cam={cam}
        keys={[
          { at: 0, x: hook.x + 200, y: hook.y - 90 },
          { at: 3.0, x: hook.x + 200, y: hook.y + 18 },
          { at: 7.2, x: hook.x + 200, y: hook.y + 18 },
          { at: FILL + 1.4, x: find.x, y: find.y },
          { at: len(scene), x: find.x, y: find.y },
        ]}
        clicks={[FILL + 1.7]}
      />
    </Stage>
  );
};

/* -------------------------------------------------------------- 14. trust ---
 * The whole panel, held. Nothing to point at — the claim is about what isn't
 * there, and the shot is the watch list sitting in the browser it never leaves.
 */
export const Trust: React.FC<{ scene: Scene }> = ({ scene }) => {
  const t = useT();
  const { eye, fit, fitCol } = useEye();
  const s = state('popup-full');
  // No browser window here. The claim is about what isn't behind the product,
  // and a 384px column inside a 1440px window leaves two thirds of the frame
  // empty for thirteen seconds. The panel moves to the right, the three things
  // that aren't there get the space that was going to waste, and the shot is
  // finally about something.
  const panel = { x: 1180, y: 0, w: s.w, h: s.h };
  const cam = drift(
    fit({ x: 60, y: 0, w: 1180 + s.w - 60, h: s.h }, 60, 1.35),
    t,
    len(scene),
    0.04
  );
  const claims = [
    ['No server', 'the checks run in your own Chrome'],
    ['No account', 'nothing to sign up for'],
    ['Nothing leaves your browser', 'the watch list is local storage'],
  ];
  return (
    <Stage>
      <Camera cam={cam}>
        <Shot name="popup-full" x={panel.x} y={panel.y} radius={12} shadow />
        <div style={{ position: 'absolute', left: 60, top: 40, width: 1010 }}>
          {claims.map(([head, sub], i) => {
            const p = ramp(t, 1.4 + i * 1.5, 2.1 + i * 1.5);
            return (
              <div
                key={head}
                style={{
                  marginBottom: 44,
                  opacity: p,
                  transform: `translateY(${(1 - p) * 14}px)`,
                }}
              >
                <div
                  style={{
                    font: `700 54px/1.15 ${SANS}`,
                    letterSpacing: '-.028em',
                    color: C.ink,
                  }}
                >
                  {head}
                </div>
                <div style={{ marginTop: 10, font: `400 27px/1.35 ${SANS}`, color: C.ink2 }}>
                  {sub}
                </div>
              </div>
            );
          })}
          <div
            style={{
              marginTop: 18,
              paddingTop: 26,
              borderTop: `1px solid ${C.edge2}`,
              font: `600 34px/1.3 ${SANS}`,
              letterSpacing: '-.02em',
              color: C.open,
              opacity: ramp(t, 7.4, 8.2),
            }}
          >
            It tells you. You book.
          </div>
        </div>
      </Camera>
    </Stage>
  );
};

/* --------------------------------------------------------------- 15. card --- */

export const Card: React.FC<{ scene: Scene }> = () => {
  const t = useT();
  const { eye, fit, fitCol } = useEye();
  return (
    <Stage>
      <EndCard t={t} />
    </Stage>
  );
};
