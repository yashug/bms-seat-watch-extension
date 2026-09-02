import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { C, SANS } from '../theme';
import type { Caption as Cap } from '../timeline';

/**
 * Burned-in captions, bottom band.
 *
 * Not an accessibility afterthought — most people watch a demo muted, so these
 * carry the whole thing on their own and the narration is the redundant half.
 * One line at a time, big, on a scrim: two stacked lines halve the size of both
 * and nobody reads either.
 */
const IN = 8;   // frames to fade a caption in
const OUT = 7;

export const Captions: React.FC<{ captions: Cap[]; sceneFrames: number }> = ({
  captions,
  sceneFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  if (!captions.length) return null;

  // A vertical cut is a third of the width and read at arm's length on a
  // phone. Sizing the caption as a fraction of the frame keeps it the same
  // apparent size in all three cuts instead of shrinking with the canvas.
  //
  // It also moves: in a wide frame the caption is a subtitle and belongs under
  // the picture, but in a tall one it is the headline — the first thing read,
  // and the reason anybody stops scrolling — so it goes to the top and the
  // card around it comes off.
  const wide = width / height >= 1.35;
  const size = Math.round(width * (wide ? 0.021 : 0.049));

  return (
    <>
      {captions.map(([text, at], i) => {
        const from = Math.round(at * fps);
        const next = captions[i + 1];
        const to = next ? Math.round(next[1] * fps) : sceneFrames;
        const opacity = interpolate(
          frame,
          [from, from + IN, to - OUT, to],
          [0, 1, 1, 0],
          { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
        );
        if (opacity <= 0.001) return null;
        const rise = interpolate(frame, [from, from + IN], [10, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              ...(wide
                ? { bottom: Math.round(height * 0.069) }
                : { top: Math.round(height * 0.055) }),
              display: 'flex',
              justifyContent: 'center',
              padding: wide ? 0 : `0 ${Math.round(width * 0.07)}px`,
              opacity,
              transform: `translateY(${rise}px)`,
            }}
          >
            <div
              style={{
                maxWidth: width - Math.round(width * 0.09),
                padding: wide
                  ? `${Math.round(size * 0.38)}px ${Math.round(size * 0.75)}px`
                  : 0,
                borderRadius: Math.round(size * 0.33),
                background: wide ? 'rgba(255,255,255,.90)' : 'transparent',
                border: wide ? `1px solid ${C.edge}` : 'none',
                boxShadow: wide ? '0 10px 34px rgba(22,32,47,.13)' : 'none',
                backdropFilter: wide ? 'blur(6px)' : undefined,
                font: `${wide ? 600 : 700} ${size}px/1.2 ${SANS}`,
                letterSpacing: wide ? '-.022em' : '-.032em',
                color: C.ink,
                textAlign: 'center',
              }}
            >
              {text}
            </div>
          </div>
        );
      })}
    </>
  );
};
