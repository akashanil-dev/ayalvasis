import type { ModuleManifest } from '@tuxos/sdk';

export const manifest: ModuleManifest = {
  id: 'settings',
  version: '1.0.0',
  title: 'Settings',
  capabilities: [],
  activation: ['onApp:settings'],
  contributes: {
    apps: [{
      id: 'settings',
      title: 'Settings',
      icon: 'settings',
      category: 'Settings',
      description: 'Choose your desktop environment and wallpaper, and add your OpenAI API key.',
    }],
  },
};
