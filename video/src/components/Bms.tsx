import React from 'react';
import { C, SANS } from '../theme';

/* ------------------------------------------------------------- the bell ---
 *
 * The two places a film can be put on the release watch: a card on the
 * upcoming listing, and the film's own page.
 *
 * Diagrams, not screenshots — the same decision as the chip row in Props.tsx,
 * and for the same reason: recreating BookMyShow's pages pixel for pixel and
 * cutting them into a video would be a claim about their site that a mock-up
 * cannot make. So the surfaces are drawn in the extension's palette and the
 * *button* is exact, every value below lifted from content.css, because the
 * button is the thing being demonstrated.
 */

const BELL = {
  size: 30,
  floatSize: 46,
  border: '#E2C79A',
  bg: '#FDF6E9',
  onBg: '#B9822A',
};

/**
 * The bell itself. `on` is the state after the click — content.css swaps the
 * glyph to a tick rather than crossing the bell out, because a crossed-out
 * bell is the icon for "muted", which is the opposite of what clicking it did.
 */
export const Bell: React.FC<{
  on?: boolean;
  hover?: number;    // 0..1 — content.css scales it 1.1 on hover
  show?: number;     // 0..1 — fading in when the extension is introduced
  floating?: boolean;
}> = ({ on, hover = 0, show = 1, floating }) => {
  const size = floating ? BELL.floatSize : BELL.size;
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        boxSizing: 'border-box',
        border: `1px solid ${on ? BELL.onBg : BELL.border}`,
        background: on ? BELL.onBg : hover > 0.5 ? '#F8EACC' : BELL.bg,
        color: on ? '#FFFFFF' : C.ink,
        font: `600 ${floating ? 20 : 14}px/${size - 2}px ${SANS}`,
        textAlign: 'center',
        opacity: (on ? 1 : 0.9 + 0.1 * hover) * show,
        transform: `scale(${(0.7 + 0.3 * show) * (1 + 0.1 * hover)})`,
        boxShadow: '0 1px 4px rgba(22,32,47,.18)',
      }}
    >
      {on ? '✓' : '🔔'}
    </div>
  );
};

/* ------------------------------------------------------- route 1: cards ---
 * The upcoming listing. Four films; the bell sits top-right of each card,
 * which is where content.css puts it.
 */

export type Film = { title: string; when: string; tags: string };

export const FILMS: Film[] = [
  { title: 'I’m Game', when: 'Thu, 3 Sep', tags: 'Malayalam, Telugu, Hindi' },
  { title: 'The Odyssey', when: 'Fri, 11 Sep', tags: 'English · Drama' },
  { title: 'Ramba Oorvasi Menaka', when: 'Fri, 18 Sep', tags: 'Telugu · Comedy' },
  { title: 'Mirzapur: The Movie', when: 'Fri, 25 Sep', tags: 'Hindi · Action' },
];

const CARD_W = 208;
const CARD_GAP = 20;
const POSTER_H = 180;
const CARD_H = POSTER_H + 76;
const GRID_PAD = 30;
const GRID_TOP = 104;         // 30 padding + 26 title + 6 + 16 sub + 26 gap

export const UPCOMING = {
  x: 0,
  y: 0,
  w: GRID_PAD * 2 + CARD_W * 4 + CARD_GAP * 3,
  h: GRID_TOP + CARD_H + GRID_PAD,
};

/** A card's box, for framing a close-up on it. */
export const cardBox = (i: number) => ({
  x: GRID_PAD + i * (CARD_W + CARD_GAP),
  y: GRID_TOP,
  w: CARD_W,
  h: CARD_H,
});

/**
 * Where the bell's centre sits on card `i`. content.css pins it 8px in from
 * the card's top-right, 30px square — so its centre is 23px in either way.
 */
export const cardBell = (i: number) => {
  const box = cardBox(i);
  return { x: box.x + box.w - 8 - BELL.size / 2, y: box.y + 8 + BELL.size / 2 };
};

/** Poster art without artwork: a band of colour and a shape, so the card reads
 *  as a film card without borrowing anybody's key art. */
const Poster: React.FC<{ i: number }> = ({ i }) => {
  const tints = ['#2C3D57', '#3E3350', '#1F4A44', '#4A3628'];
  return (
    <div
      style={{
        height: POSTER_H,
        borderRadius: '9px 9px 0 0',
        background: `linear-gradient(160deg, ${tints[i % 4]}, rgba(22,32,47,.86))`,
      }}
    />
  );
};

export const UpcomingGrid: React.FC<{
  bells?: number;        // 0..1 — the bells fading in
  onIndex?: number;      // the card whose bell has been clicked
  hoverIndex?: number;
  hover?: number;
}> = ({ bells = 0, onIndex = -1, hoverIndex = -1, hover = 0 }) => (
  <div
    style={{
      position: 'absolute',
      left: 0,
      top: 0,
      boxSizing: 'border-box',
      width: UPCOMING.w,
      padding: `${GRID_PAD}px`,
      borderRadius: 16,
      background: C.card,
      border: `1px solid ${C.edge}`,
      boxShadow: '0 22px 60px rgba(22,32,47,.15), 0 2px 8px rgba(22,32,47,.06)',
    }}
  >
    <div style={{ font: `650 22px/1.2 ${SANS}`, color: C.ink, letterSpacing: '-.02em' }}>
      Upcoming movies
    </div>
    <div style={{ marginTop: 6, font: `400 13px/1.25 ${SANS}`, color: C.ink2 }}>
      Hyderabad
    </div>
    <div style={{ display: 'flex', gap: CARD_GAP, marginTop: 26 }}>
      {FILMS.map((f, i) => (
        <div
          key={f.title}
          style={{
            position: 'relative',
            width: CARD_W,
            borderRadius: 10,
            background: C.card,
            border: `1px solid ${C.edge}`,
            overflow: 'hidden',
          }}
        >
          <Poster i={i} />
          <div style={{ padding: '11px 12px 14px' }}>
            <div
              style={{
                font: `650 14.5px/1.25 ${SANS}`,
                color: C.ink,
                letterSpacing: '-.01em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {f.title}
            </div>
            <div style={{ marginTop: 5, font: `400 11.5px/1.3 ${SANS}`, color: C.ink3 }}>
              {f.tags}
            </div>
          </div>
          <div style={{ position: 'absolute', top: 8, right: 8 }}>
            <Bell
              show={bells}
              on={i === onIndex}
              hover={i === hoverIndex ? hover : 0}
            />
          </div>
        </div>
      ))}
    </div>
  </div>
);

/* -------------------------------------------------- route 2: film page ---
 * The film's own page. content.css floats the bell bottom-LEFT here on
 * purpose: BookMyShow's own "Book tickets" call to action lives bottom-right,
 * and a button that covers it would be the worst possible place to put one.
 */

export const FILM_PAGE = { x: 0, y: 0, w: 760, h: 428 };

/**
 * What the close-up frames: the title and the floating bell together.
 *
 * Not the bell on its own. A 46px button filling the frame against a dark
 * gradient could be a button on anything — the shot has to keep saying "this
 * is a film's page", and the title is the only thing in it that does.
 */
export const FILM_FOCUS = { x: 0, y: 20, w: 545, h: FILM_PAGE.h - 20 };
const FLOAT_INSET = 22;
export const FILM_BELL = {
  x: FLOAT_INSET + BELL.floatSize / 2,
  y: FILM_PAGE.h - FLOAT_INSET - BELL.floatSize / 2,
};

export const FilmPage: React.FC<{
  film?: Film;
  bell?: number;
  on?: boolean;
  hover?: number;
}> = ({ film = FILMS[0], bell = 0, on, hover = 0 }) => (
  <div
    style={{
      position: 'absolute',
      left: 0,
      top: 0,
      boxSizing: 'border-box',
      width: FILM_PAGE.w,
      height: FILM_PAGE.h,
      borderRadius: 16,
      overflow: 'hidden',
      background: C.card,
      border: `1px solid ${C.edge}`,
      boxShadow: '0 22px 60px rgba(22,32,47,.15), 0 2px 8px rgba(22,32,47,.06)',
    }}
  >
    {/* The hero art fills the top of that layout, which is why the bell floats
        clear of it rather than sitting in it. */}
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: 'linear-gradient(150deg, #2C3D57 0%, #16202F 62%)',
      }}
    />
    {/* The key art the real page carries, as a shape. It is here because its
        absence is what the empty right half of the frame was — and because the
        bell's corner is chosen relative to a page that has art in it. */}
    <div
      style={{
        position: 'absolute',
        right: 44,
        top: 44,
        width: 226,
        height: FILM_PAGE.h - 88,
        borderRadius: 10,
        background: 'linear-gradient(155deg, rgba(255,255,255,.16), rgba(255,255,255,.04))',
        border: '1px solid rgba(255,255,255,.14)',
      }}
    />
    <div style={{ position: 'absolute', left: 34, top: 40, width: 440 }}>
      <div
        style={{
          font: `700 44px/1.1 ${SANS}`,
          letterSpacing: '-.03em',
          color: '#FFFFFF',
        }}
      >
        {film.title}
      </div>
      <div style={{ marginTop: 14, font: `400 16px/1.4 ${SANS}`, color: 'rgba(255,255,255,.68)' }}>
        {film.tags}
      </div>
      <div
        style={{
          display: 'inline-block',
          marginTop: 26,
          padding: '10px 16px',
          borderRadius: 8,
          background: 'rgba(255,255,255,.12)',
          border: '1px solid rgba(255,255,255,.22)',
          font: `600 15px/1 ${SANS}`,
          color: '#FFFFFF',
        }}
      >
        Releasing on {film.when}
      </div>
    </div>
    <div
      style={{
        position: 'absolute',
        left: FILM_BELL.x - BELL.floatSize / 2,
        top: FILM_BELL.y - BELL.floatSize / 2,
      }}
    >
      <Bell floating show={bell} on={on} hover={hover} />
    </div>
  </div>
);
