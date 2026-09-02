import React from 'react';
import { Img, staticFile } from 'remotion';
import { C, SANS } from '../theme';
import { src, state } from '../states';

/**
 * Two ways to show the interface, and the difference is not decoration.
 *
 * The popup is a panel that hangs off a toolbar button. Shown on its own it is
 * a floating rectangle nobody can place; shown under the pinned icon it is
 * instantly the thing you get when you click that icon — so it gets a window
 * around it, and the video spends a click arriving there.
 *
 * The settings page is a page. It needs no window to be legible, and putting
 * one round it would only add a frame for the camera to fight when it pans
 * two thousand pixels down the same document.
 */

export const CHROME_H = 96;
export const POPUP_PLATE = { w: 1440, h: 860 };

/** The pinned extension button, in popup-plate coordinates. */
export const EXT_ICON = { x: 1348, y: 54, size: 28 };
export const EXT_CENTRE = { x: EXT_ICON.x + 14, y: EXT_ICON.y + 14 };

/** Where the popup hangs: right edge under the icon, a hair below the toolbar. */
export const POPUP_AT = { x: EXT_ICON.x + 26 - 384, y: CHROME_H + 6 };


/**
 * A page behind the popup.
 *
 * Deliberately a skeleton and not a recreation of anyone's listing: the popup
 * is the subject and the page only has to stop the window reading as an empty
 * white rectangle for the second and a half before the panel opens. Anything
 * more specific would be a claim about a site this footage never visited.
 */
const Bar: React.FC<{ w: number; h?: number; mt?: number }> = ({ w, h = 16, mt = 0 }) => (
  <div
    style={{
      width: w,
      height: h,
      marginTop: mt,
      borderRadius: h / 2,
      background: C.edge,
      opacity: 0.55,
    }}
  />
);

const PageSkeleton: React.FC = () => (
  <div style={{ position: 'absolute', inset: 0, padding: '46px 60px' }}>
    <Bar w={300} h={22} />
    <Bar w={172} h={13} mt={16} />
    <div style={{ display: 'flex', gap: 18, marginTop: 40 }}>
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            width: 168,
            height: 112,
            borderRadius: 12,
            background: C.edge,
            opacity: 0.4,
          }}
        />
      ))}
    </div>
    <Bar w={240} h={15} mt={44} />
    <Bar w={520} h={11} mt={18} />
    <Bar w={460} h={11} mt={12} />
    <Bar w={496} h={11} mt={12} />
  </div>
);

const Dot: React.FC<{ fill: string }> = ({ fill }) => (
  <div style={{ width: 12, height: 12, borderRadius: '50%', background: fill }} />
);

/**
 * A browser window. Deliberately generic: no site's branding, no logo, and the
 * page behind the popup is left as plain paper. The video is about the panel
 * hanging off the toolbar, and a recreated storefront behind it would be a
 * claim about someone else's page that this footage cannot honestly make.
 */
export const Browser: React.FC<{
  w?: number;
  h?: number;
  url?: string;
  badge?: string;
  skeleton?: boolean;
  children?: React.ReactNode;
}> = ({ w = POPUP_PLATE.w, h = POPUP_PLATE.h, url = 'in.bookmyshow.com', badge, skeleton = true, children }) => (
  <div
    style={{
      position: 'absolute',
      left: 0,
      top: 0,
      width: w,
      height: h,
      borderRadius: 15,
      background: C.card,
      border: `1px solid ${C.edge}`,
      boxShadow: '0 26px 70px rgba(22,32,47,.17), 0 3px 9px rgba(22,32,47,.07)',
      overflow: 'hidden',
    }}
  >
    <div
      style={{
        height: CHROME_H,
        background: '#F7F8FB',
        borderBottom: `1px solid ${C.edge}`,
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', gap: 8, padding: '15px 0 0 16px' }}>
        <Dot fill="#E6A9A2" />
        <Dot fill="#E7CFA0" />
        <Dot fill="#A9CDB4" />
      </div>
      {/* The address bar, with the host only — a full seat-map URL is 120
          characters of ids and reads as noise at any size. */}
      <div
        style={{
          position: 'absolute',
          left: 118,
          right: 132,
          top: 48,
          height: 34,
          borderRadius: 17,
          background: C.sunk,
          border: `1px solid ${C.edge}`,
          display: 'flex',
          alignItems: 'center',
          padding: '0 14px',
          font: `400 13px/1 ${SANS}`,
          color: C.ink2,
        }}
      >
        {url}
      </div>
      <div
        style={{
          position: 'absolute',
          left: EXT_ICON.x,
          top: EXT_ICON.y,
          width: EXT_ICON.size,
          height: EXT_ICON.size,
        }}
      >
        <Img
          src={staticFile('icon128.png')}
          style={{ width: '100%', height: '100%', borderRadius: 6 }}
        />
        {badge ? (
          <div
            style={{
              position: 'absolute',
              right: -4,
              bottom: -3,
              minWidth: 15,
              height: 14,
              padding: '0 3px',
              borderRadius: 4,
              background: C.open,
              color: '#fff',
              font: `700 9px/14px ${SANS}`,
              textAlign: 'center',
            }}
          >
            {badge}
          </div>
        ) : null}
      </div>
      <div
        style={{
          position: 'absolute',
          right: 18,
          top: 55,
          width: 26,
          height: 26,
          borderRadius: '50%',
          background: C.edge,
        }}
      />
    </div>
    <div style={{ position: 'absolute', inset: `${CHROME_H}px 0 0 0`, background: C.paper }}>
      {skeleton ? <PageSkeleton /> : null}
      {children}
    </div>
  </div>
);

/** A rendered UI state, drawn at its own CSS size in plate coordinates. */
export const Shot: React.FC<{
  name: string;
  x?: number;
  y?: number;
  opacity?: number;
  radius?: number;
  shadow?: boolean;
}> = ({ name, x = 0, y = 0, opacity = 1, radius = 0, shadow }) => {
  const s = state(name);
  return (
    <Img
      src={src(name)}
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: s.w,
        height: s.h,
        opacity,
        borderRadius: radius,
        boxShadow: shadow
          ? '0 22px 60px rgba(22,32,47,.18), 0 2px 8px rgba(22,32,47,.07)'
          : undefined,
      }}
    />
  );
};

/**
 * The popup, in a window, hanging off the pinned icon.
 *
 * `reveal` animates it out of the button rather than fading it in on the spot:
 * a panel that grows from the control that opened it is the one piece of
 * motion that explains where the thing came from, which is the entire point of
 * spending a click getting here.
 *
 * `under` + `mix` cross-fade two states of the same popup — the same trick the
 * chip row uses, so a click can visibly change what the panel says.
 */
export const PopupIn: React.FC<{
  name: string;
  under?: string;
  mix?: number;
  badge?: string;
  reveal?: number;
}> = ({ name, under, mix = 0, badge, reveal = 1 }) => (
  <Browser badge={badge}>
    <div
      style={{
        position: 'absolute',
        inset: 0,
        opacity: reveal,
        transform: `scale(${0.94 + 0.06 * reveal})`,
        transformOrigin: `${POPUP_AT.x + 384}px ${POPUP_AT.y - CHROME_H}px`,
      }}
    >
      {under ? (
        <Shot name={under} x={POPUP_AT.x} y={POPUP_AT.y - CHROME_H} radius={10} shadow />
      ) : null}
      <Shot
        name={name}
        x={POPUP_AT.x}
        y={POPUP_AT.y - CHROME_H}
        radius={10}
        shadow
        opacity={under ? mix : 1}
      />
    </div>
  </Browser>
);

/** A popup rect in plate (window) coordinates. */
export const inPopup = (r: { x: number; y: number; w: number; h: number }) => ({
  ...r,
  x: r.x + POPUP_AT.x,
  y: r.y + POPUP_AT.y,
});

/**
 * A shot of the popup, framed for the shape of the cut.
 *
 * In a wide frame the window is the subject horizontally: the panel hangs off
 * the right-hand end of a 1440px window, so centring on the panel alone slides
 * two thirds of the window off the left edge, and the popup only decides how
 * close the camera gets.
 *
 * In a tall frame there is no width to spend on a window. Framing it anyway
 * costs about a third of the panel's size and buys nothing — by that point in
 * the cut the viewer has already seen where the popup comes from.
 */
export const popupFrame = (
  name: string,
  eye: { portrait: boolean },
  pad = 46
) => {
  const s = state(name);
  if (eye.portrait) {
    // A little of the window either side, so it still reads as a panel over a
    // page rather than as a floating screenshot.
    const margin = 120;
    return {
      x: POPUP_AT.x - margin,
      y: POPUP_AT.y - pad,
      w: s.w + margin + (POPUP_PLATE.w - POPUP_AT.x - s.w),
      h: s.h + pad * 2,
    };
  }
  return { x: 0, y: POPUP_AT.y - pad, w: POPUP_PLATE.w, h: s.h + pad * 2 };
};
