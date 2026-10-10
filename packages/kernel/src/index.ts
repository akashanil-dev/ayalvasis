import { fsActions } from './actions/fs';
import { sessionActions } from './actions/session';
import { Kernel, type KernelOptions } from './kernel';

export { KernelError } from './errors';
export { Kernel } from './kernel';
export type {
  ActionContext,
  ActionDefinition,
  ActionFs,
  DispatchOptions,
  KernelOptions,
  KernelSnapshot,
} from './kernel';
export type { KernelState, SessionState, UserAccount, Window } from './state';
export { resolvePath } from './vfs';
export type { DirNode, FileNode, Stat, VNode } from './vfs';

/** A kernel with the built-in actions registered. Modules register theirs on top. */
export function createKernel(options: KernelOptions): Kernel {
  const kernel = new Kernel(options);
  for (const action of fsActions) kernel.register(action);
  for (const action of sessionActions) kernel.register(action);
  return kernel;
}
