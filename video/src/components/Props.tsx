import React from 'react';
import { Img, interpolate, staticFile, useCurrentFrame, useVideoConfig, Easing } from 'remotion';
import { C, MONO, SANS } from '../theme';

/* ---------------------------------------------------------------- chips ---
 *
 * The showtime chip, and the control the extension puts on it.
 *
 * This is a diagram, not a screenshot. Recreating BookMyShow's listing pixel
 * for pixel and cutting it into a promo video would be a claim about their
 * page that footage of a mock-up cannot make — so this is drawn in the
 * extension's own palette instead, the way the settings page draws the same
 * picture in its "click the +" panel. The button itself is exact: every value
 * below is lifted from content.css, which is the thing being demonstrated.
 *
 * Replacing this scene with a real screen recording is the one upgrade worth
 * making by hand; see video/README.md.
 */

export type ChipState = { time: string; screen: string; sold?: boolean; on?: boolean };

const PLUS = {
  size: 19,
  border: '#7CBFA0',
  bg: '#EAF6F0',
  fg: '#106B42',
  onBg: '#17915C',
};

export const Chip: React.FC<{
  chip: ChipState;
  plus?: number;      // 0..1 — the button fading in
  ticked?: boolean;
  hover?: number;     // 0..1 — content.css scales the button 1.14 on hover
}> = ({ chip, plus = 0, ticked, hover = 0 }) => (
  <div
    style={{
      position: 'relative',
      boxSizing: 'border-box',
      width: 132,
      padding: '11px 10px 10px',
      borderRadius: 9,
      background: chip.sold ? '#EDF0F5' : C.card,
      border: `1px solid ${chip.sold ? C.edge : '#B6D9C6'}`,
      opacity: chip.sold ? 0.62 : 1,
      textAlign: 'center',
    }}
  >
    <div
      style={{
        font: `650 16px/1 ${SANS}`,
        color: chip.sold ? C.ink3 : C.open,
        letterSpacing: '-.01em',
      }}
    >
      {chip.time}
    </div>
    <div
      style={{
        marginTop: 6,
        font: `500 9px/1 ${SANS}`,
        letterSpacing: '.08em',
        color: C.ink3,
      }}
    >
      {chip.screen}
    </div>
    {plus > 0 ? (
      <div
        style={{
          position: 'absolute',
          bottom: -7,
          right: -7,
          width: PLUS.size,
          height: PLUS.size,
          borderRadius: '50%',
          border: `1px solid ${ticked ? PLUS.onBg : PLUS.border}`,
          background: ticked ? PLUS.onBg : PLUS.bg,
          color: ticked ? '#FFFFFF' : PLUS.fg,
          font: `600 12px/17px ${SANS}`,
          textAlign: 'center',
          opacity: (ticked ? 1 : 0.78 + 0.22 * hover) * plus,
          transform: `scale(${(0.6 + 0.4 * plus) * (1 + 0.14 * hover)})`,
          boxShadow: '0 1px 3px rgba(22,32,47,.16)',
        }}
      >
        {ticked ? '✓' : '+'}
      </div>
    ) : null}
  </div>
);

export const ChipRow: React.FC<{
  cinema: string;
  chips: ChipState[];
  plus?: number;
  tickIndex?: number;
  hoverIndex?: number;
  hover?: number;
}> = ({ cinema, chips, plus = 0, tickIndex = -1, hoverIndex = -1, hover = 0 }) => (
  <div
    style={{
      position: 'absolute',
      left: 0,
      top: 0,
      boxSizing: 'border-box',
      width: 720,
      padding: '26px 28px 30px',
      borderRadius: 16,
      background: C.card,
      border: `1px solid ${C.edge}`,
      boxShadow: '0 22px 60px rgba(22,32,47,.15), 0 2px 8px rgba(22,32,47,.06)',
    }}
  >
    <div style={{ font: `650 19px/1.2 ${SANS}`, color: C.ink, letterSpacing: '-.015em' }}>
      {cinema}
    </div>
    <div style={{ marginTop: 5, font: `400 12.5px/1.4 ${SANS}`, color: C.ink2 }}>
      Wed, 02 September · Spider-Man: Brand New Day
    </div>
    <div style={{ display: 'flex', gap: 18, marginTop: 24 }}>
      {chips.map((c, i) => (
        <Chip
          key={i}
          chip={c}
          plus={plus}
          ticked={i === tickIndex}
          hover={i === hoverIndex ? hover : 0}
        />
      ))}
    </div>
  </div>
);

/**
 * The chip row's own geometry, so the pointer can be aimed at a real target.
 *
 * Derived from the styles above rather than measured, because this row is drawn
 * by the video rather than screenshotted — the numbers have to be kept in step
 * by hand, which is why they are written out as a sum instead of as a constant.
 *
 *   26 padding + 22.8 title + 5 gap + 17.5 subtitle + 24 gap = 95.3 to the chips
 *   1 border + 11 + 16 time + 6 + 9 screen + 10 + 1 border   = 54 per chip
 *
 * content.css puts the button at bottom: -7 / right: -7 at 19px square, so its
 * centre sits 2.5px inside the chip's bottom-right corner.
 */
const PAD_L = 29;
const CHIP_W = 132;
const CHIP_GAP = 18;
const CHIP_TOP = 95.3;
const CHIP_H = 54;

export const CHIP_ROW = { x: 0, y: 0, w: 720, h: CHIP_TOP + CHIP_H + 31 };
export const chipPlus = (i: number) => ({
  x: PAD_L + i * (CHIP_W + CHIP_GAP) + CHIP_W - 2.5,
  y: CHIP_TOP + CHIP_H - 2.5,
});
/** A chip's box, for framing a close-up on it. */
export const chipBox = (i: number) => ({
  x: PAD_L + i * (CHIP_W + CHIP_GAP),
  y: CHIP_TOP,
  w: CHIP_W,
  h: CHIP_H,
});

/* --------------------------------------------------------------- toast ---
 * content.css draws a card with a real shadow when a show is added. Same
 * geometry, same words.
 */
export const Toast: React.FC<{ text: string; show: number; x?: number; y?: number }> = ({
  text,
  show,
  // Where the chip row wants it. Anything drawn at another size — the upcoming
  // grid, a film page — passes its own, because a toast pinned to one scene's
  // geometry lands in the middle of another's artwork.
  x = 360,
  y = 212,
}) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: y,
      transform: `translate(-50%, ${interpolate(show, [0, 1], [14, 0])}px)`,
      opacity: show,
      padding: '11px 16px',
      borderRadius: 10,
      background: C.card,
      border: `1px solid ${C.edge}`,
      boxShadow: '0 10px 30px rgba(22,32,47,.18)',
      font: `500 14px/1 ${SANS}`,
      color: C.ink,
      whiteSpace: 'nowrap',
    }}
  >
    {text}
  </div>
);

/* -------------------------------------------------------- notification ---
 * The desktop notification, with the title, message and buttons background.js
 * actually sends. Drawn rather than screenshotted because a real one cannot be
 * captured inside a deterministic render — but the strings are the real ones.
 */
export const NOTIFY = { w: 372, x: 1024, y: 40 };
/** Measured off the rendered banner: 16 padding, two lines of title, the
 *  message, the button row, 16 again. Framing needs it and CSS will not
 *  report it back to a camera that runs a frame ahead of layout. */
export const NOTIFY_H = 122;

export const Notification: React.FC<{
  title: string;
  message: string;
  buttons: string[];
  t: number;         // seconds since the scene started
  at: number;        // when it slides in
  /** Plate coordinates. The camera group has no width of its own, so a banner
   *  pinned with `right` would resolve against nothing and land off-screen. */
  x?: number;
  y?: number;
  /** When it slides back out. A notification that stays up after it has been
   *  clicked sits on top of the panel it just opened — which in this video is
   *  directly over the Book now button the next line is about. */
  gone?: number;
}> = ({ title, message, buttons, t, at, x = NOTIFY.x, y = NOTIFY.y, gone }) => {
  const inP = interpolate(t, [at, at + 0.5], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
    easing: Easing.bezier(0.16, 0.9, 0.24, 1),
  });
  const outP =
    gone === undefined
      ? 1
      : interpolate(t, [gone, gone + 0.4], [1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
          easing: Easing.bezier(0.4, 0, 0.9, 0.4),
        });
  const p = inP * outP;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: NOTIFY.w,
        padding: 16,
        borderRadius: 14,
        background: 'rgba(255,255,255,.97)',
        border: `1px solid ${C.edge}`,
        boxShadow: '0 18px 46px rgba(22,32,47,.22)',
        transform: `translateX(${(1 - p) * 420}px)`,
        opacity: p,
        display: 'flex',
        gap: 13,
      }}
    >
      <Img src={staticFile('icon128.png')} style={{ width: 42, height: 42, borderRadius: 9 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ font: `650 14px/1.3 ${SANS}`, color: C.ink }}>{title}</div>
        <div style={{ marginTop: 4, font: `400 13px/1.35 ${MONO}`, color: C.ink2 }}>
          {message}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 11 }}>
          {buttons.map((b) => (
            <div
              key={b}
              style={{
                padding: '6px 11px',
                borderRadius: 7,
                border: `1px solid ${C.edge2}`,
                font: `500 12px/1 ${SANS}`,
                color: C.ink2,
              }}
            >
              {b}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------- end card --- */

export const EndCard: React.FC<{ t: number }> = ({ t }) => {
  const { width, height } = useVideoConfig();
  // Typed as a fraction of the frame: 78px is a headline on a 1920 master and
  // shouts on a 1080 Reel, and the two have to look like the same card. Tall
  // frames get a larger unit than their width implies — scaling a card by width
  // alone leaves it marooned in the middle of 1920px of height.
  const u = width / (width / height < 1.35 ? 1180 : 1920);
  const rise = (d: number) =>
    interpolate(t, [d, d + 0.5], [0, 1], {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
      easing: Easing.out(Easing.cubic),
    });
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
      }}
    >
      <Img
        src={staticFile('icon128.png')}
        style={{
          width: 132 * u,
          height: 132 * u,
          borderRadius: 28 * u,
          opacity: rise(0),
          transform: `translateY(${(1 - rise(0)) * 16}px)`,
          boxShadow: '0 16px 40px rgba(22,32,47,.16)',
        }}
      />
      <div
        style={{
          marginTop: 36 * u,
          font: `700 ${Math.round(78 * u)}px/1.1 ${SANS}`,
          letterSpacing: '-.03em',
          color: C.ink,
          textAlign: 'center',
          padding: `0 ${40 * u}px`,
          opacity: rise(0.2),
          transform: `translateY(${(1 - rise(0.2)) * 14}px)`,
        }}
      >
        Seat Watch for BookMyShow
      </div>
      <div
        style={{
          marginTop: 20 * u,
          font: `400 ${Math.round(31 * u)}px/1.4 ${SANS}`,
          color: C.ink2,
          opacity: rise(0.4),
        }}
      >
        Tells you when the seats you actually want open up.
      </div>
      <div
        style={{
          marginTop: 44 * u,
          padding: `${16 * u}px ${32 * u}px`,
          borderRadius: 13 * u,
          background: C.open,
          color: '#fff',
          font: `600 ${Math.round(28 * u)}px/1 ${SANS}`,
          opacity: rise(0.62),
          transform: `translateY(${(1 - rise(0.62)) * 10}px)`,
        }}
      >
        Free · Chrome Web Store
      </div>
      <div
        style={{
          marginTop: 22 * u,
          font: `400 ${Math.round(22 * u)}px/1 ${SANS}`,
          color: C.ink3,
          opacity: rise(0.78),
        }}
      >
        Search “Seat Watch” on the Chrome Web Store
      </div>
    </div>
  );
};
