import { createKernel, type Kernel, type SessionState, type KernelSnapshot } from '@ayalvasis/kernel';
import { createModuleHost, type ModuleHost } from '@ayalvasis/module-host';
import type { AppContribution, DispatchResult, KernelEvent, ModuleDefinition, ModuleManifest } from '@ayalvasis/sdk';
import { createShell, type RunResult, type Shell } from '@ayalvasis/shell';

export interface KeyValueStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface ModuleEntry {
  manifest: ModuleManifest;
  load: () => Promise<ModuleDefinition>;
}

export interface TerminalSession {
  run(line: string): Promise<RunResult>;
  cwd(): Promise<string>;
}

export interface SystemClient {
  boot(username: string): Promise<void>;
  hasSave(): Promise<string | null>;
  dispatch<R>(type: string, payload: unknown): Promise<DispatchResult<R>>;
  subscribe(listener: (event: KernelEvent) => void): () => void;
  onChange(listener: (event: KernelEvent) => void): () => void;
  session(): Promise<SessionState>;
  apps(): Promise<(AppContribution & { moduleId: string })[]>;
  openApp(appId: string): Promise<DispatchResult<string>>;
  createTerminal(): Promise<TerminalSession>;
  reset(): Promise<void>;
}

const SAVE_KEY = 'ayalvasis.save';

export function createLocalSystem(options: { storage: KeyValueStorage; modules: ModuleEntry[] }): SystemClient {
  let kernel: Kernel | undefined;
  let shell: Shell | undefined;
  let host: ModuleHost | undefined;
  let unsubscribe: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pendingSave: Promise<void> | undefined;
  let resolveSave: (() => void) | undefined;
  let rejectSave: ((error: unknown) => void) | undefined;
  const changeListeners = new Set<(event: KernelEvent) => void>();

  const requireKernel = (): Kernel => {
    if (!kernel) throw new Error('system has not booted');
    return kernel;
  };

  const armSave = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      timer = undefined;
      try {
        const current = requireKernel();
        await options.storage.set(SAVE_KEY, JSON.stringify({ username: current.user, snapshot: current.snapshot() }));
        resolveSave?.();
        pendingSave = undefined;
      } catch (error) {
        rejectSave?.(error);
      }
    }, 500);
  };

  const save = (): Promise<void> => {
    if (pendingSave) { armSave(); return pendingSave; }
    pendingSave = new Promise<void>((resolve, reject) => { resolveSave = resolve; rejectSave = reject; });
    void pendingSave.catch(() => undefined);
    armSave();
    return pendingSave;
  };

  const boot = async (username: string): Promise<void> => {
    const saved = await options.storage.get(SAVE_KEY);
    let snapshot: KernelSnapshot | undefined;
    if (saved) {
      const parsed = JSON.parse(saved) as { username?: string; snapshot?: KernelSnapshot };
      if (parsed.username === username) snapshot = parsed.snapshot;
    }
    unsubscribe?.();
    kernel = createKernel(snapshot ? { snapshot } : { username });
    shell = createShell(kernel);
    host = createModuleHost({ kernel, shell });
    options.modules.forEach((entry) => host!.add(entry.manifest, entry.load));
    unsubscribe = kernel.subscribe((event) => {
      if (!event.ok || !event.mutates) return;
      void save();
      for (const listener of changeListeners) listener(event);
    });
    await host.start();
  };

  return {
    boot,
    async hasSave() {
      const saved = await options.storage.get(SAVE_KEY);
      if (!saved) return null;
      return (JSON.parse(saved) as { username?: string }).username ?? null;
    },
    async dispatch<R>(type: string, payload: unknown) {
      const result = requireKernel().dispatch<R>({ type, payload });
      if (result.ok && requireKernel().events().at(-1)?.mutates) await save();
      return result;
    },
    subscribe(listener) {
      return requireKernel().subscribe(listener);
    },
    onChange(listener) {
      changeListeners.add(listener);
      return () => changeListeners.delete(listener);
    },
    async session() {
      return structuredClone(requireKernel().getState().session);
    },
    async apps() {
      if (!host) throw new Error('system has not booted');
      return host.apps();
    },
    async openApp(appId) {
      if (!host) throw new Error('system has not booted');
      try {
        await host.openApp(appId);
      } catch (error) {
        return { ok: false, error: { code: 'EIO', message: error instanceof Error ? error.message : String(error) } };
      }
      const app = host.apps().find((candidate) => candidate.id === appId);
      return this.dispatch<string>('session.open', {
        appId, title: app?.title ?? appId, width: 720, height: 480,
      });
    },
    async createTerminal() {
      if (!shell) throw new Error('system has not booted');
      const activeShell = shell;
      return {
        async run(line: string) {
          const result = await activeShell.run(line);
          if (requireKernel().events().at(-1)?.mutates) await save();
          return result;
        },
        cwd: async () => activeShell.cwd,
      };
    },
    async reset() {
      if (timer) clearTimeout(timer);
      rejectSave?.(new Error('system reset'));
      pendingSave = undefined;
      unsubscribe?.();
      changeListeners.clear();
      kernel = undefined;
      shell = undefined;
      host = undefined;
      await options.storage.remove(SAVE_KEY);
    },
  };
}
