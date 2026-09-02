import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Stage } from './components/Stage';
import { Camera, grow, move } from './components/Camera';
import { Cursor } from './components/Cursor';
import { Toast } from './components/Props';
import {
  FILM_BELL,
  FILM_FOCUS,
  FILM_PAGE,
  FILMS,
  FilmPage,
  UPCOMING,
  UpcomingGrid,
  cardBell,
  cardBox,
} from './components/Bms';
import { C, SANS } from './theme';
import { ramp } from './scenes/common';
import { useEye } from './viewport';
import { useCurrentFrame, useVideoConfig } from 'remotion';

/**
 * How a film gets on the release watch, both ways, on a loop.
 *
 * There are two of them because there are two places you meet a film you can't
 * book yet: browsing the upcoming list, and standing on the film's own page
 * having followed a link to it. The bell is in both, and it is not in the same
 * corner of both — on a card it sits top-right, on a film page it floats
 * bottom-LEFT, clear of BookMyShow's own "Book tickets" button. Somebody who
 * has only been shown the card goes looking in the wrong corner, which is the
 * whole reason this shows both rather than one and a sentence about the other.
 *
 * Silent and captioned rather than narrated: this is a help video that will be
 * watched muted in a store listing or a README, and it has to say which route
 * is which without sound. That is also why each route gets a numbered label —
 * a viewer arriving mid-loop needs to know they are in the second of two, not
 * watching one long take.
 */

const useT = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return frame / fps;
};

const ROUTE_A = 0;
const ROUTE_B = 6.9;
export const ADD_FILM_SECONDS = 13.8;

/** The seam. A loop's join is the one edit every viewer sees, because they see
 *  it every time round — so the last third of a second fades to the paper the
 *  first frame fades up from, and the two ends meet on the same empty ground. */
const SEAM = 0.35;

/* ------------------------------------------------------------- the label --- */

const Label: React.FC<{ n: string; text: string; show: number }> = ({ n, text, show }) => (
  <div
    // At the foot rather than the head. The camera pushes into the top of the
    // artwork in both routes, so a label up there lands on the thing it is
    // labelling — and the bottom band is empty in every frame of both.
    style={{
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 42,
      display: 'flex',
      justifyContent: 'center',
      opacity: show,
      transform: `translateY(${(1 - show) * 8}px)`,
    }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 20px 10px 12px',
        borderRadius: 999,
        background: C.card,
        border: `1px solid ${C.edge}`,
        boxShadow: '0 6px 20px rgba(22,32,47,.10)',
      }}
    >
      <span
        style={{
          width: 26,
          height: 26,
          borderRadius: '50%',
          background: C.amber,
          color: '#FFFFFF',
          font: `700 14px/26px ${SANS}`,
          textAlign: 'center',
        }}
      >
        {n}
      </span>
      <span style={{ font: `600 19px/1 ${SANS}`, color: C.ink, letterSpacing: '-.015em' }}>
        {text}
      </span>
    </div>
  </div>
);

/* ------------------------------------------------------ 1. from the list --- */

const WATCHING = 'Watching — you’ll get a ping when booking opens.';

const FromList: React.FC = () => {
  const t = useT();
  const { fit } = useEye();
  const CLICK = 4.5;
  const bell = cardBell(0);
  const card = cardBox(0);

  // Wide enough to still read as a listing of films: the card, its heading and
  // a slice of its neighbour. A crop tight on the bell would be a picture of a
  // button with nothing around it to say what it is attached to.
  const cam = move(t, [
    { at: ROUTE_A, cam: fit(UPCOMING, 90) },
    { at: 3.2, cam: fit(grow(card, 104, 190, 46, 40), 70) },
    { at: ROUTE_B - 0.4, cam: fit(grow(card, 96, 176, 40, 34), 64) },
  ]);

  return (
    <Stage tint="rgba(185,130,42,.10)">
      <Camera cam={cam}>
        <UpcomingGrid
          bells={ramp(t, 1.0, 1.8)}
          onIndex={t >= CLICK ? 0 : -1}
          hoverIndex={0}
          hover={ramp(t, 3.4, 4.2)}
        />
        <Toast
          text={WATCHING}
          x={card.x + card.w / 2 + 40}
          y={card.y + card.h + 26}
          show={ramp(t, CLICK + 0.35, CLICK + 0.7) * (1 - ramp(t, ROUTE_B - 0.9, ROUTE_B - 0.5))}
        />
      </Camera>
      <Cursor
        cam={cam}
        keys={[
          { at: 0.6, x: bell.x + 300, y: bell.y + 210 },
          { at: CLICK - 0.6, x: bell.x, y: bell.y },
          // Off the button once it has been pressed. The tick is the whole
          // point of the shot and the pointer was sitting on top of it.
          { at: CLICK + 0.55, x: bell.x + 46, y: bell.y + 40 },
          { at: ROUTE_B, x: bell.x + 46, y: bell.y + 40 },
        ]}
        clicks={[CLICK]}
      />
      <Label n="1" text="On the upcoming list — the bell on the card" show={ramp(t, 0.5, 1.1)} />
    </Stage>
  );
};

/* ------------------------------------------------- 2. from the film page --- */

const FromFilm: React.FC = () => {
  const t = useT();
  const { fit } = useEye();
  const CLICK = ROUTE_B + 4.1;

  const cam = move(t, [
    { at: ROUTE_B, cam: fit(FILM_PAGE, 90) },
    { at: ROUTE_B + 3.0, cam: fit(FILM_FOCUS, 70) },
    { at: ADD_FILM_SECONDS, cam: fit(grow(FILM_FOCUS, 0, -18, 0, 0), 64) },
  ]);

  return (
    <Stage tint="rgba(185,130,42,.10)">
      <Camera cam={cam}>
        <FilmPage
          film={FILMS[0]}
          bell={ramp(t, ROUTE_B + 0.7, ROUTE_B + 1.5)}
          on={t >= CLICK}
          hover={ramp(t, ROUTE_B + 3.1, ROUTE_B + 3.8)}
        />
        <Toast
          text={WATCHING}
          x={FILM_PAGE.w / 2 - 40}
          y={FILM_PAGE.h - 96}
          show={ramp(t, CLICK + 0.35, CLICK + 0.7)}
        />
      </Camera>
      <Cursor
        cam={cam}
        keys={[
          { at: ROUTE_B + 0.4, x: FILM_BELL.x + 330, y: FILM_BELL.y - 190 },
          { at: CLICK - 0.6, x: FILM_BELL.x, y: FILM_BELL.y },
          { at: CLICK + 0.55, x: FILM_BELL.x + 52, y: FILM_BELL.y - 34 },
          { at: ADD_FILM_SECONDS, x: FILM_BELL.x + 52, y: FILM_BELL.y - 34 },
        ]}
        clicks={[CLICK]}
      />
      <Label
        n="2"
        text="Or on the film’s own page — bottom left"
        show={ramp(t, ROUTE_B + 0.2, ROUTE_B + 0.8)}
      />
    </Stage>
  );
};

/* -------------------------------------------------------------- the loop --- */

export const AddFilm: React.FC = () => {
  const t = useT();
  // A cut, not a dissolve. The two routes are alternatives rather than steps,
  // and cross-fading them reads as "and then", which is the one thing this
  // must not say.
  const second = t >= ROUTE_B;
  const seam =
    ramp(t, 0, 0.3) * (1 - ramp(t, ADD_FILM_SECONDS - SEAM, ADD_FILM_SECONDS));
  return (
    <AbsoluteFill style={{ background: C.paper }}>
      <AbsoluteFill style={{ opacity: seam }}>
        {second ? <FromFilm /> : <FromList />}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
