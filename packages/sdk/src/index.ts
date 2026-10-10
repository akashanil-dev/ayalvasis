// Shared contracts between the kernel, modules, the UI and the tutor.
// Everything that changes the system is an Action sent through the kernel's dispatch,
// whether it comes from the learner, a module or the AI tutor.

/** Who sent an action. The tutor is an actor like any other, limited by its capabilities. */
export interface Actor {
  kind: 'user' | 'tutor' | 'module' | 'system';
  id: string;
}

/**
 * A permission to use a group of actions, written "<area>:<verb>", e.g. "fs:read".
 * A grant of "fs:*" covers every fs capability and "*" covers everything.
 */
export type Capability = string;

export interface Action<P = unknown> {
  type: string;
  payload: P;
}

export interface ActionError {
  /** errno-style code, e.g. ENOENT, EACCES, EPERM, ENOSYS. */
  code: string;
  message: string;
}

export type DispatchResult<R = unknown> =
  | { ok: true; value: R }
  | { ok: false; error: ActionError };

/** One entry in the kernel's event log: every dispatch, successful or not. */
export interface KernelEvent {
  seq: number;
  time: number;
  actor: Actor;
  /** The Linux user the action ran as. */
  user: string;
  action: Action;
  ok: boolean;
  error?: ActionError;
  /** True when the action changed state, so replaying the log rebuilds the system. */
  mutates: boolean;
}

/** A desktop icon and the window it opens. */
export interface AppContribution {
  id: string;
  title: string;
  icon: string;
  description?: string;
}

/** A program a module installs into the shell, e.g. "docker". */
export interface CommandContribution {
  name: string;
  summary: string;
}

/** What a module declares about itself. The module host reads this before loading any code. */
export interface ModuleManifest {
  id: string;
  version: string;
  title: string;
  /** Capabilities the module needs. The kernel refuses actions outside this list. */
  capabilities: Capability[];
  contributes: {
    apps?: AppContribution[];
    commands?: CommandContribution[];
  };
}
