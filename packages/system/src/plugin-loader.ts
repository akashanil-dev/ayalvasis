import type { ModuleHost } from '@tuxos/module-host';
import type { SystemClient } from './index';

export interface PluginLoaderHooks {
  onRegisterAppView?(appId: string): void;
  onUnregisterAppView?(appId: string): void;
}

/** Compatibility entry point. Discovery and reconciliation belong to the managed lifecycle. */
export async function discoverPlugins(system: SystemClient, _host: ModuleHost, _hooks: PluginLoaderHooks = {}): Promise<void> {
  await system.plugins?.().reload();
}
