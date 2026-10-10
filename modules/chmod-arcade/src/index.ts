import type { ModuleDefinition } from '@ayalvasis/sdk';
import { manifest } from './manifest';

export { manifest } from './manifest';

// The game is entirely in its window; its best score is a file in the learner's home.
export const chmodArcade: ModuleDefinition = {
  manifest,
  activate() {},
};

export default chmodArcade;
