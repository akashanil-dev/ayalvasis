// The kernel: owns the system state and is the only way to change it.
// Every request goes through dispatch, which checks the actor's capabilities, runs the action,
// and records the outcome in the event log that the UI, lessons and the tutor subscribe to.

import type { Action, ActionError, Actor, Capability, DispatchResult, KernelEvent } from '@ayalvasis/sdk';
import { KernelError } from './errors';
import { createInitialState, type KernelState } from './state';

export interface ActionContext {
  state: KernelState;
  actor: Actor;
  /** The Linux user the action runs as. */
  user: string;
  now: number;
}

export interface ActionDefinition<P = unknown, R = unknown> {
  type: string;
  capability: Capability;
  description: string;
  /** Whether the action changes state. Read-only actions are logged but skipped on replay. */
  mutates: boolean;
  run(ctx: ActionContext, payload: P): R;
}

export interface KernelSnapshot {
  version: typeof SNAPSHOT_VERSION;
  state: KernelState;
}

export interface KernelOptions {
  /** A fresh system for this learner. Ignored when restoring from a snapshot. */
  username?: string;
  snapshot?: KernelSnapshot;
  /** How many events to keep in memory. Older ones are dropped. */
  logLimit?: number;
  now?: () => number;
}

export interface DispatchOptions {
  actor?: Actor;
  /** Run as this Linux user instead of the session's user, e.g. for sudo. */
  user?: string;
}

const SNAPSHOT_VERSION = 1;
const SYSTEM: Actor = { kind: 'system', id: 'kernel' };

export class Kernel {
  private state: KernelState;
  private readonly sessionUser: string;
  private readonly definitions = new Map<string, ActionDefinition>();
  private readonly grants = new Map<string, Capability[]>();
  private readonly listeners = new Set<(event: KernelEvent) => void>();
  private readonly log: KernelEvent[] = [];
  private readonly logLimit: number;
  private readonly now: () => number;
  private seq = 0;

  constructor(options: KernelOptions) {
    this.now = options.now ?? Date.now;
    if (options.snapshot) {
      if (options.snapshot.version !== SNAPSHOT_VERSION) {
        throw new KernelError('EINVAL', `unsupported snapshot version: ${options.snapshot.version}`);
      }
      this.state = restoreState(options.snapshot.state);
    } else if (options.username) {
      this.state = createInitialState(options.username, 'ayalvasis', this.now());
    } else {
      throw new KernelError('EINVAL', 'a kernel needs a username or a snapshot');
    }
    const user = Object.keys(this.state.users).find((name) => name !== 'root');
    if (!user) throw new KernelError('EINVAL', 'the system has no regular user');
    this.sessionUser = user;
    this.logLimit = options.logLimit ?? 1000;
    // The learner and the system itself can do anything the system allows; others need grants.
    this.grant({ kind: 'user', id: user }, ['*']);
    this.grant(SYSTEM, ['*']);
  }

  get user(): string {
    return this.sessionUser;
  }

  register(definition: ActionDefinition<any, any>): void {
    if (this.definitions.has(definition.type)) {
      throw new KernelError('EEXIST', `action already registered: ${definition.type}`);
    }
    this.definitions.set(definition.type, definition);
  }

  /** All registered actions, e.g. to describe them to the tutor as tools. */
  actions(): ActionDefinition[] {
    return [...this.definitions.values()];
  }

  grant(actor: Actor, capabilities: Capability[]): void {
    this.grants.set(actorKey(actor), [...capabilities]);
  }

  can(actor: Actor, capability: Capability): boolean {
    const granted = this.grants.get(actorKey(actor)) ?? [];
    const [area] = capability.split(':');
    return granted.some((cap) => cap === '*' || cap === capability || cap === `${area}:*`);
  }

  dispatch<R = unknown>(action: Action, options: DispatchOptions = {}): DispatchResult<R> {
    const now = this.now();
    const actor = options.actor ?? { kind: 'user', id: this.sessionUser };
    const user = options.user ?? this.sessionUser;
    const definition = this.definitions.get(action.type);

    let result: DispatchResult<R>;
    if (!definition) {
      result = failure('ENOSYS', `unknown action: ${action.type}`);
    } else if (!this.can(actor, definition.capability)) {
      result = failure('EPERM', `${actor.kind}:${actor.id} lacks capability ${definition.capability}`);
    } else if (!this.state.users[user]) {
      result = failure('EINVAL', `no such user: ${user}`);
    } else {
      result = this.run<R>(definition, { state: this.state, actor, user, now }, action.payload);
    }

    this.record({
      seq: ++this.seq,
      time: now,
      actor,
      user,
      action,
      ok: result.ok,
      ...(result.ok ? {} : { error: result.error }),
      mutates: result.ok && (definition?.mutates ?? false),
    });
    return result;
  }

  subscribe(listener: (event: KernelEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  events(): readonly KernelEvent[] {
    return this.log;
  }

  getState(): Readonly<KernelState> {
    return this.state;
  }

  snapshot(): KernelSnapshot {
    return { version: SNAPSHOT_VERSION, state: structuredClone(this.state) };
  }

  private run<R>(definition: ActionDefinition, ctx: ActionContext, payload: unknown): DispatchResult<R> {
    // Actions mutate state in place, so work on a copy and only keep it if the action succeeds.
    // That way a failed action can never leave the system half-changed.
    const draft = definition.mutates ? structuredClone(ctx.state) : ctx.state;
    try {
      const value = definition.run({ ...ctx, state: draft }, payload) as R;
      this.state = draft;
      return { ok: true, value };
    } catch (err) {
      if (err instanceof KernelError) return failure(err.code, err.message);
      throw err;
    }
  }

  private record(event: KernelEvent): void {
    this.log.push(event);
    if (this.log.length > this.logLimit) this.log.splice(0, this.log.length - this.logLimit);
    for (const listener of this.listeners) listener(event);
  }
}

function restoreState(state: KernelState): KernelState {
  const restored = structuredClone(state);
  const fill = (node: import('./vfs').VNode): void => {
    node.mtime ??= 0;
    if (node.kind === 'dir') for (const child of Object.values(node.children)) fill(child);
  };
  fill(restored.fs);
  return restored;
}

function actorKey(actor: Actor): string {
  return `${actor.kind}:${actor.id}`;
}

function failure(code: string, message: string): { ok: false; error: ActionError } {
  return { ok: false, error: { code, message } };
}
