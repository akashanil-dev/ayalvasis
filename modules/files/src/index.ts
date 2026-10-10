import type { ModuleDefinition } from '@ayalvasis/sdk';
import { manifest } from './manifest';

export { manifest } from './manifest';

// Files is a pure app: everything it does goes through the kernel's fs.* actions as the learner.
export const files: ModuleDefinition = {
  manifest,
  activate() {},
};

export default files;
