import { describe, expect, it } from 'vitest';
import { createKernel } from '@tuxos/kernel';
import { createCommandRegistry, createShell } from '@tuxos/shell';
import { createModuleHost } from '@tuxos/module-host';
import { discoverPlugins } from './plugin-loader';
import { createLocalSystem, type KeyValueStorage } from './index';

function inMemoryStorage(): KeyValueStorage {
  const map = new Map<string, string>();
  return {
    get: async (key) => map.get(key) ?? null,
    set: async (key, value) => { map.set(key, value); },
    remove: async (key) => { map.delete(key); },
  };
}

describe('discoverPlugins', () => {
  it('discovers plugins from ~/.local/share/tuxos/plugins and registers apps lazily', async () => {
    const storage = inMemoryStorage();
    const registeredViews: string[] = [];

    const system = createLocalSystem({
      storage,
      modules: [],
      plugins: {
        onRegisterAppView: (appId) => registeredViews.push(appId),
      },
    });

    await system.boot('ada');

    // Create a plugin in the virtual filesystem
    const pluginDir = '/home/ada/.local/share/tuxos/plugins/calc';
    await system.dispatch('fs.mkdir', { path: pluginDir, parents: true });
    await system.dispatch('fs.write', {
      path: `${pluginDir}/manifest.json`,
      content: JSON.stringify({
        id: 'calc',
        name: 'Scientific Calculator',
        version: '1.0.0',
        description: 'Calculator plugin',
        capabilities: ['fs:read'],
        contributes: {
          apps: [
            { id: 'calc', title: 'Calculator', icon: 'calc' },
          ],
          commands: [
            { name: 'calc', summary: 'Run calculator' },
          ],
        },
      }),
    });
    await system.dispatch('fs.write', {
      path: `${pluginDir}/index.html`,
      content: '<!DOCTYPE html><html><body><h1>Calc</h1></body></html>',
    });
    await system.dispatch('fs.write', {
      path: `${pluginDir}/install.json`, content: JSON.stringify({ enabled: true, approved: ['fs:read'] }),
    });

    // Re-run discovery (simulate reboot or reload)
    await system.reloadPlugins?.();

    expect(registeredViews).toContain('calc');
    const apps = await system.apps();
    expect(apps.some((a) => a.id === 'calc')).toBe(true);

    // Test uninstalling the plugin
    await system.uninstallPlugin?.('calc');
    const appsAfter = await system.apps();
    expect(appsAfter.some((a) => a.id === 'calc')).toBe(false);

    // Directory in VFS should be removed
    const readRes = await system.dispatch('fs.stat', { path: pluginDir });
    expect(readRes.ok).toBe(false);
    await system.reset();
  });
});
