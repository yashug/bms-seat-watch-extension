import { Config } from '@remotion/cli/config';

Config.setVideoImageFormat('jpeg');
Config.setOverwriteOutput(true);
// The stills are 2x and the camera pushes into them; 20 is visibly soft on the
// seat grid, where a whole row of 6px squares has to stay square.
Config.setJpegQuality(95);
