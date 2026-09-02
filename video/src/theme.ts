/**
 * The video's palette is the extension's palette, copied from ui.css rather
 * than imported — the frames around the interface have to match the interface,
 * and a video that drifts a shade off its own product looks like someone
 * else's ad for it.
 */
export const FPS = 30;
export const W = 1920;
export const H = 1080;

export const C = {
  paper: '#F4F6FA',
  card: '#FFFFFF',
  sunk: '#EEF1F7',
  edge: '#E1E7F0',
  edge2: '#CFD8E6',
  taken: '#D2DAE7',
  free: '#6E86AF',
  open: '#17915C',
  open2: '#E7F4ED',
  ink: '#16202F',
  ink2: '#55637A',
  ink3: '#8894A8',
  bad: '#C2453E',
  amber: '#B9822A',
} as const;

export const SANS =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
export const MONO =
  'ui-monospace, SFMono-Regular, "SF Mono", "Roboto Mono", Menlo, monospace';

/** The master cut's shape. Every other cut declares its own; see viewport.ts,
 *  which is what actually decides where the camera points. */
