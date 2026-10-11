import { createKernel, type Kernel, type SessionState, type KernelSnapshot } from '@tuxos/kernel';
import { learningRuntime } from '@tuxos/lessons';
import { createModuleHost, type ModuleHost } from '@tuxos/module-host';
import type {
  Actor, AppContribution, DispatchResult, KernelEvent, ModuleDefinition, ModuleManifest, LearningBackend,
} from '@tuxos/sdk';
import {
  createCommandRegistry,
  createShell,
  type CommandRegistry,
  type Completion,
  type RunResult,
  type Shell,
} from '@tuxos/shell';

export interface KeyValueStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface ModuleEntry {
  manifest: ModuleManifest;
  load: () => Promise<ModuleDefinition>;
}

/** One terminal window's shell: its own cwd, env and history, sharing the system's commands. */
export interface TerminalSession {
  run(line: string): Promise<RunResult>;
  cwd(): Promise<string>;
  prompt(): Promise<string>;
  complete(line: string, cursor: number): Promise<Completion>;
  history(): Promise<string[]>;
}

export interface TerminalOptions {
  /** Route learning slash commands and assessments to the course that owns this terminal. */
  learningModule?: string;
}

export interface SystemClient {
  boot(username: string): Promise<void>;
  hasSave(): Promise<string | null>;
  dispatch<R>(type: string, payload: unknown): Promise<DispatchResult<R>>;
  subscribe(listener: (event: KernelEvent) => void): () => void;
  /** Successful state changes only (file writes, window moves...), from any source. */
  onChange(listener: (event: KernelEvent) => void): () => void;
  /** Called when saving to storage fails. The system keeps running; the learner should be told. */
  onSaveError(listener: (error: Error) => void): () => void;
  /** Save now instead of waiting for the debounce. Rejects if storage fails. */
  flush(): Promise<void>;
  user(): Promise<string>;
  hostname(): Promise<string>;
  session(): Promise<SessionState>;
  apps(): Promise<(AppContribution & { moduleId: string })[]>;
  openApp(appId: string, args?: Record<string, string>): Promise<DispatchResult<string>>;
  createTerminal(options?: TerminalOptions): Promise<TerminalSession>;
  /** The AI tutor's own, permission-limited access to the system. */
  tutor(): TutorAccess;
  reset(): Promise<void>;
}

export interface ActionInfo {
  type: string;
  description: string;
  capability: string;
  mutates: boolean;
  params?: Record<string, unknown>;
}

/**
 * Everything the tutor does goes through the kernel as the `tutor` actor, so the kernel's capability
 * checks decide what it may do. It never acts as root unless granted `user:switch`.
 */
export interface TutorAccess {
  readonly actor: Actor;
  setCapabilities(capabilities: string[]): void;
  can(capability: string): boolean;
  dispatch<R>(type: string, payload: unknown): Promise<DispatchResult<R>>;
  /** Open an app window as the tutor (activating its module first, like the desktop does). */
  openApp(appId: string, args?: Record<string, string>): Promise<DispatchResult<string>>;
  /** A shell of the tutor's own: commands run as the learner's Linux user, but checked as the tutor. */
  createTerminal(): Promise<TerminalSession>;
  actions(): ActionInfo[];
  /** The most recent events, oldest first, for building the tutor's picture of what the learner did. */
  recentEvents(limit: number): KernelEvent[];
}

const SAVE_KEY = 'tuxos.save';
const TUTOR: Actor = { kind: 'tutor', id: 'tutor' };
const SAVE_DELAY_MS = 500;

interface Running {
  kernel: Kernel;
  registry: CommandRegistry;
  host: ModuleHost;
  unsubscribe: () => void;
}

export function createLocalSystem(options: {
  storage: KeyValueStorage;
  modules: ModuleEntry[];
  learning?: LearningBackend;
}): SystemClient {
  let running: Running | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const changeListeners = new Set<(event: KernelEvent) => void>();
  const saveErrorListeners = new Set<(error: Error) => void>();

  const current = (): Running => {
    if (!running) throw new Error('system has not booted');
    return running;
  };

  const writeSave = async (): Promise<void> => {
    const { kernel } = current();
    await options.storage.set(SAVE_KEY, JSON.stringify({ username: kernel.user, snapshot: kernel.snapshot() }));
  };

  // Saving never blocks the learner: changes are batched and written after a short pause.
  const scheduleSave = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      writeSave().catch((cause: unknown) => {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        for (const listener of saveErrorListeners) listener(error);
      });
    }, SAVE_DELAY_MS);
  };

  const boot = async (username: string): Promise<void> => {
    const snapshot = await savedSnapshot(options.storage, username);
    running?.unsubscribe();
    const kernel = createKernel(snapshot ? { snapshot } : { username });
    const registry = createCommandRegistry();
    const host = createModuleHost({
      kernel,
      shell: createShell(kernel, { registry }),
      learning: options.learning ?? browserLearningBackend(),
    });
    for (const entry of options.modules) host.add(entry.manifest, entry.load);
    const unsubscribe = kernel.subscribe((event) => {
      if (!event.ok || !event.mutates) return;
      scheduleSave();
      for (const listener of changeListeners) listener(event);
    });
    running = { kernel, registry, host, unsubscribe };
    await host.start();
  };

  const client: SystemClient = {
    boot,
    async hasSave() {
      const saved = await options.storage.get(SAVE_KEY);
      if (!saved) return null;
      return (JSON.parse(saved) as { username?: string }).username ?? null;
    },
    async dispatch<R>(type: string, payload: unknown) {
      return current().kernel.dispatch<R>({ type, payload });
    },
    subscribe(listener) {
      return current().kernel.subscribe(listener);
    },
    onChange(listener) {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
    onSaveError(listener) {
      saveErrorListeners.add(listener);
      return () => saveErrorListeners.delete(listener);
    },
    async flush() {
      if (timer) clearTimeout(timer);
      timer = undefined;
      await writeSave();
    },
    async user() {
      return current().kernel.user;
    },
    async hostname() {
      return current().kernel.getState().hostname;
    },
    async session() {
      return structuredClone(current().kernel.getState().session);
    },
    async apps() {
      return current().host.apps();
    },
    async openApp(appId, args) {
      const { host } = current();
      try {
        await host.openApp(appId);
      } catch (error) {
        return { ok: false, error: { code: 'EIO', message: error instanceof Error ? error.message : String(error) } };
      }
      const app = host.apps().find((candidate) => candidate.id === appId);
      return client.dispatch<string>('session.open', {
        appId, title: app?.title ?? appId, width: 720, height: 480, ...(args ? { args } : {}),
      });
    },
    async createTerminal(options = {}) {
      const { kernel, registry } = current();
      const shell = createShell(kernel, { registry });
      if (options.learningModule) shell.env.TUXOS_LEARNING_MODULE = options.learningModule;
      return terminalSession(kernel, shell, options.learningModule);
    },
    tutor() {
      const { kernel, registry } = current();
      return {
        actor: TUTOR,
        setCapabilities: (capabilities) => kernel.grant(TUTOR, capabilities),
        can: (capability) => kernel.can(TUTOR, capability),
        dispatch: async <R>(type: string, payload: unknown) => kernel.dispatch<R>({ type, payload }, { actor: TUTOR }),
        createTerminal: async () => terminalSession(kernel, createShell(kernel, { registry, actor: TUTOR })),
        actions: () => kernel.actions().map(({ type, description, capability, mutates, params }) => ({
          type, description, capability, mutates, ...(params ? { params } : {}),
        })),
        async openApp(appId, args) {
          try {
            await current().host.openApp(appId);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { ok: false, error: { code: 'EIO', message } };
          }
          const app = current().host.apps().find((candidate) => candidate.id === appId);
          return kernel.dispatch<string>({ type: 'session.open', payload: {
            appId, title: app?.title ?? appId, width: 720, height: 480, ...(args ? { args } : {}),
          } }, { actor: TUTOR });
        },
        recentEvents: (limit) => kernel.events().slice(-limit),
      };
    },
    async reset() {
      if (timer) clearTimeout(timer);
      timer = undefined;
      running?.unsubscribe();
      running = undefined;
      changeListeners.clear();
      await options.storage.remove(SAVE_KEY);
    },
  };
  return client;
}

/** The browser sends learning requests to the local API; the secret stays on that server. */
function browserLearningBackend(): LearningBackend {
  return {
    async request(path, body) {
      const response = await fetch(`/api/learning${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({ error: `learning service returned HTTP ${response.status}` }));
      if (!response.ok) throw new Error((data as { error?: string }).error ?? `learning service returned HTTP ${response.status}`);
      return data;
    },
  };
}

async function savedSnapshot(storage: KeyValueStorage, username: string): Promise<KernelSnapshot | undefined> {
  const saved = await storage.get(SAVE_KEY);
  if (!saved) return undefined;
  const parsed = JSON.parse(saved) as { username?: string; snapshot?: KernelSnapshot };
  return parsed.username === username ? parsed.snapshot : undefined;
}

function terminalSession(kernel: Kernel, shell: Shell, learningModule?: string): TerminalSession {
  return {
    run: async (line) => {
      const result = await shell.run(line);
      const runner = learningModule ? learningRuntime.get(learningModule) : learningRuntime.get();
      const assessment = await runner?.waitForAssessment();
      return assessment
        ? { ...result, stdout: `${result.stdout}${result.stdout.endsWith('\n') || !result.stdout ? '' : '\n'}[Trainer] ${assessment}\n` }
        : result;
    },
    cwd: async () => shell.cwd,
    prompt: async () => bashPrompt(kernel.user, kernel.getState().hostname, shell.cwd, shell.env.HOME ?? ''),
    complete: async (line, cursor) => shell.complete(line, cursor),
    history: async () => shell.history(),
  };
}

/** bash's default prompt, `\u@\h:\w\$ `: home shown as ~, and # instead of $ for root. */
export function bashPrompt(user: string, hostname: string, cwd: string, home: string): string {
  const inHome = home && (cwd === home || cwd.startsWith(`${home}/`));
  const dir = inHome ? `~${cwd.slice(home.length)}` : cwd;
  return `${user}@${hostname}:${dir}${user === 'root' ? '#' : '$'} `;
}

/** What the desktop passes to every app window's view. */
export interface AppViewProps {
  system: SystemClient;
  windowId: string;
  args?: Record<string, string>;
  /**
   * Ask before the learner closes this window from its title bar. The guard returns false to keep it open,
   * e.g. after the learner declines to discard unsaved changes. Pass null to remove it.
   */
  setCloseGuard?(guard: (() => boolean) | null): void;
}
