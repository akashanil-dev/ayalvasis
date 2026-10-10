import type { ModuleDefinition } from '@ayalvasis/sdk';
import { manifest } from './manifest';

export { manifest } from './manifest';

// Text Editor reads and writes files through the kernel's fs.* actions as the learner.
export const editor: ModuleDefinition = {
  manifest,
  activate() {},
};

export default editor;
