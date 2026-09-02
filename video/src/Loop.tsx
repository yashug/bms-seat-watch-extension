import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import { Add } from './scenes/open';
import { Hall, Alert } from './scenes/seats';
import { sceneById } from './timeline';
import type { Scene } from './timeline';

/**
 * Six silent seconds that loop: the + clicked on a sold-out showtime, the
 * notification arriving, the block of green seats it found.
 *
 * No captions and no sound, because of where it goes — the top of an X post
 * and the top of a Reddit thread, autoplaying at 400px wide in a timeline
 * somebody is scrolling past. Anything with body text in it is unreadable at
 * that size, and the three beats have to carry it as pictures alone.
 *
 * The seek points are chosen where the scene's own camera is already tight —
 * a loop that opens on an establishing shot has spent a third of itself
 * before it shows anything.
 *
 * Each window is a seek into a scene of the full video rather than a separate
 * animation: a negative Sequence offset starts the scene before the window
 * opens, so it is already mid-move when the loop reaches it. Rebuilding these
 * moments by hand would mean two things to keep in step.
 */
const Window: React.FC<{
  scene: Scene;
  at: number;      // where this window starts in the loop, seconds
  from: number;    // where to seek into the scene, seconds
  length: number;
}> = ({ scene, at, from, length }) => {
  const { fps } = useVideoConfig();
  const Body = BODIES[scene.id];
  return (
    <Sequence
      from={Math.round(at * fps)}
      durationInFrames={Math.round(length * fps)}
      name={`${scene.id} @${from}s`}
      layout="none"
    >
      <Sequence from={-Math.round(from * fps)} layout="none">
        <AbsoluteFill>
          <Body scene={scene} />
        </AbsoluteFill>
      </Sequence>
    </Sequence>
  );
};

const BODIES: Record<string, React.FC<{ scene: Scene }>> = {
  add: Add,
  hall: Hall,
  alert: Alert,
};

export const LOOP_SECONDS = 6.2;

export const Loop: React.FC = () => (
  <AbsoluteFill style={{ background: '#F4F6FA' }}>
    <Window scene={sceneById('add')} at={0} from={4.85} length={2.3} />
    <Window scene={sceneById('alert')} at={2.3} from={3.05} length={2.2} />
    <Window scene={sceneById('hall')} at={4.5} from={5.6} length={1.7} />
  </AbsoluteFill>
);
