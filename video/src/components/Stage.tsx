import React from 'react';
import { AbsoluteFill } from 'remotion';
import { C } from '../theme';

/**
 * The room the product sits in: the same paper as the extension, under the
 * same seat-grid wallpaper the settings page draws behind its header. Copied
 * from options.html rather than imported, for the same reason frame.css
 * duplicates its palette — this renders standalone, and a backdrop that
 * silently loses its texture is worse than one that repeats a few lines.
 */
const SEATS =
  `url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26">` +
  `<rect x="3" y="3" width="12" height="9" rx="2.5" fill="none" stroke="%2316202F" stroke-width="1.2" opacity="0.045"/></svg>')`;

export const Stage: React.FC<{ children?: React.ReactNode; tint?: string }> = ({
  children,
  tint,
}) => (
  <AbsoluteFill style={{ background: C.paper }}>
    <AbsoluteFill
      style={{
        background: `radial-gradient(70% 80% at 50% -6%, ${
          tint ?? 'rgba(23,145,92,.10)'
        }, transparent 62%), ${SEATS}`,
      }}
    />
    {children}
  </AbsoluteFill>
);
