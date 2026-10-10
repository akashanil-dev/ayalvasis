import type { ModuleManifest } from '@ayalvasis/sdk';

export const manifest: ModuleManifest = {
  id: 'terminal',
  version: '1.0.0',
  title: 'Terminal',
  capabilities: [],
  activation: ['onApp:terminal', 'onCommand:clear'],
  contributes: {
    apps: [{
      id: 'terminal',
      title: 'Terminal',
      icon: 'terminal',
      description: 'Type commands into a bash shell.',
    }],
    commands: [{ name: 'clear', summary: 'Clear the terminal screen' }],
  },
};
