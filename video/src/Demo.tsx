import React from 'react';
import { Cut } from './Cut';
import { SCENES } from './timeline';

/** The full narrated walkthrough. Every other cut is a subset of this one. */
export const Demo: React.FC = () => <Cut scenes={SCENES} bed="music/bed.wav" />;
