import type { ModuleDefinition } from '@tuxos/sdk';
import { manifest } from './manifest';

export { manifest } from './manifest';

// Settings changes the session through the kernel's session.* actions, as the learner.
export const settings: ModuleDefinition = {
  manifest,
  activate() {},
};

export default settings;
