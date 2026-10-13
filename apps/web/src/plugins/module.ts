import { defineModule } from '@tuxos/sdk';

export const pluginManagerModule = defineModule({
  manifest: {
    id: 'plugin-manager', version: '1.0.0', title: 'Plugins', capabilities: [], activation: ['onApp:plugins'],
    contributes: { apps: [{ id: 'plugins', title: 'Plugins', icon: 'plugins', category: 'System', description: 'Discover, install and manage desktop plugins.', defaultGeometry: { width: 940, height: 680 } }] },
  },
  activate() {},
});
