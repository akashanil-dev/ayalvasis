import type { ModuleDefinition } from '@tuxos/sdk';
import { manifest } from './manifest';

export { manifest } from './manifest';

// Files is a pure app: everything it does goes through the kernel's fs.* actions as the learner.
export const files: ModuleDefinition = {
  manifest,
  activate() {},
};

export default files;
